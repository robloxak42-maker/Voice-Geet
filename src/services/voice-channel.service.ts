import { Injectable, signal, inject } from '@angular/core';
import { supabase } from '../supabase.client';
import { AuthService } from './auth.service';
import { RealtimeChannel, User } from '@supabase/supabase-js';

export interface Channel {
  id: number;
  name: string;
}

export interface ChannelMember {
    user_id: string;
    users: { email: string } | null;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

@Injectable({
  providedIn: 'root',
})
export class VoiceChannelService {
  private authService = inject(AuthService);
  private user = () => this.authService.session()?.user;

  channels = signal<Channel[]>([]);
  currentChannel = signal<Channel | null>(null);
  membersInChannel = signal<ChannelMember[]>([]);
  
  isLoading = signal(false);
  isMuted = signal(false);
  
  remoteStreams = signal<MediaStream[]>([]);
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private signalingChannel: RealtimeChannel | null = null;
  private presenceSubscription: RealtimeChannel | null = null;

  async getChannels() {
    const { data, error } = await supabase.from('channels').select('*');
    if (error) {
      console.error('Error fetching channels:', error);
      return;
    }
    this.channels.set(data || []);
  }

  async joinChannel(channel: Channel) {
    if (this.currentChannel()) {
      await this.leaveChannel();
    }
    this.isLoading.set(true);
    this.currentChannel.set(channel);

    try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.localStream.getAudioTracks().forEach(track => track.enabled = !this.isMuted());
    } catch(err) {
        console.error("Error getting user media", err);
        this.isLoading.set(false);
        this.currentChannel.set(null);
        throw err;
    }
    
    await this.setupPresence(channel.id);
    await this.setupSignaling(channel.id);
    this.isLoading.set(false);
  }

  async leaveChannel() {
    const userId = this.user()?.id;
    const channelId = this.currentChannel()?.id; // Grab channel ID before clearing state

    // 1. Update presence in Supabase if possible
    if (userId && channelId) {
        const { error } = await supabase.from('channel_members').delete().match({ channel_id: channelId, user_id: userId });
        if (error) {
            console.error("Error removing user from channel:", error);
        }
    }

    // 2. Clean up WebRTC connections
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();

    // 3. Stop local media tracks
    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;
    this.remoteStreams.set([]);

    // 4. Unsubscribe from Supabase channels
    if (this.signalingChannel) {
      await supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }
    if (this.presenceSubscription) {
      await supabase.removeChannel(this.presenceSubscription);
      this.presenceSubscription = null;
    }
    
    // 5. Clear local state
    this.currentChannel.set(null);
    this.membersInChannel.set([]);
  }
  
  toggleMute() {
    this.isMuted.update(muted => !muted);
    this.localStream?.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted();
    });
  }

  private async setupPresence(channelId: number) {
    const userId = this.user()?.id;
    if (!userId) return;
    
    const { error } = await supabase.from('channel_members').upsert({ channel_id: channelId, user_id: userId });
    if(error) console.error("Error setting presence:", error);
    
    this.presenceSubscription = supabase.channel(`presence:${channelId}`);
    
    this.presenceSubscription
        .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members', filter: `channel_id=eq.${channelId}` },
            () => this.fetchMembers(channelId)
        )
        .subscribe(() => {
            this.fetchMembers(channelId);
        });
  }

  private async fetchMembers(channelId: number) {
      // Switched from a direct SELECT with a join to a remote procedure call (RPC).
      // This is a more secure and reliable way to fetch data across schemas (public -> auth)
      // without requiring elevated permissions for the client-side user role.
      // An SQL function `get_channel_members` must be created in the database for this to work.
      const { data, error } = await supabase
        .rpc('get_channel_members', { p_channel_id: channelId });
      
      if(error) {
          console.error("Error fetching members", error);
          return;
      }
      
      if(data) {
        // The RPC returns a flat array of { user_id, email }. We map this to the ChannelMember interface.
        const members: ChannelMember[] = data.map(m => ({
            user_id: m.user_id,
            users: { email: m.email }
        }));
        this.membersInChannel.set(members);
      } else {
        this.membersInChannel.set([]);
      }
  }

  private async setupSignaling(channelId: number) {
    const userId = this.user()?.id;
    if (!userId) return;

    this.signalingChannel = supabase.channel(`signaling:${channelId}`, {
      config: { broadcast: { self: false } },
    });

    this.signalingChannel.on('broadcast', { event: 'webrtc' }, ({ payload }) => {
        const { from, data } = payload;
        switch (data.type) {
          case 'offer':
            this.handleOffer(from, data.sdp);
            break;
          case 'answer':
            this.handleAnswer(from, data.sdp);
            break;
          case 'ice-candidate':
            this.handleIceCandidate(from, data.candidate);
            break;
        }
    });
    
    this.signalingChannel.subscribe(async (status) => {
        if(status === 'SUBSCRIBED') {
            const { data: members } = await supabase.from('channel_members').select('user_id').eq('channel_id', channelId);
            const otherUserIds = members?.map(m => m.user_id).filter(id => id !== userId) || [];
            otherUserIds.forEach(id => this.createPeerConnection(id, true));
        }
    });
  }

  private createPeerConnection(remoteUserId: string, isInitiator: boolean) {
    if (!this.localStream || this.peerConnections.has(remoteUserId)) return;
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(remoteUserId, pc);

    this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage(remoteUserId, { type: 'ice-candidate', candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      this.remoteStreams.update(streams => [...streams, event.streams[0]]);
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            this.handlePeerDisconnect(remoteUserId);
        }
    };

    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => this.sendSignalingMessage(remoteUserId, { type: 'offer', sdp: pc.localDescription }));
    }
  }
  
  private handlePeerDisconnect(remoteUserId: string) {
    this.peerConnections.get(remoteUserId)?.close();
    this.peerConnections.delete(remoteUserId);
    // Note: Remote stream removal is complex. For simplicity, we don't remove it from the array on disconnect
    // as it's hard to map a stream back to a user ID. A more robust solution would tag streams.
  }

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    this.createPeerConnection(from, false);
    const pc = this.peerConnections.get(from);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignalingMessage(from, { type: 'answer', sdp: pc.localDescription });
  }

  private async handleAnswer(from: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(from);
    if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }
  
  private sendSignalingMessage(to: string, data: any) {
    const userId = this.user()?.id;
    if (!this.signalingChannel || !userId) return;

    this.signalingChannel.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { from: userId, to, data },
    });
  }
}
