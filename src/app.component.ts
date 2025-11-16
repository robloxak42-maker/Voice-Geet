import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { VoiceChannelService, Channel, ChannelMember } from './services/voice-channel.service';
import { User } from '@supabase/supabase-js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [AuthService, VoiceChannelService],
})
export class AppComponent {
  authService = inject(AuthService);
  voiceChannelService = inject(VoiceChannelService);

  // Auth state
  session = this.authService.session;
  user = computed(() => this.session()?.user);
  
  // Login form state
  email = signal('');
  password = signal('');
  isSigningIn = signal(false);
  authError = signal<string | null>(null);

  // App state
  channels = this.voiceChannelService.channels;
  currentChannel = this.voiceChannelService.currentChannel;
  members = this.voiceChannelService.membersInChannel;
  remoteStreams = this.voiceChannelService.remoteStreams;
  isMuted = this.voiceChannelService.isMuted;
  isLoadingChannel = this.voiceChannelService.isLoading;
  
  constructor() {
    // Effect to fetch channels when the user logs in
    effect(() => {
      const currentSession = this.session();
      if (currentSession) {
        untracked(() => {
          this.voiceChannelService.getChannels();
        });
      }
    });
  }

  async handleLogin() {
    this.isSigningIn.set(true);
    this.authError.set(null);
    try {
      // First, try to sign in. If it fails and says "User not found", try to sign up.
      let error = await this.authService.signIn(this.email(), this.password());
      if (error && error.message.includes('Invalid login credentials')) {
         error = await this.authService.signUp(this.email(), this.password());
      }
      if(error) {
        this.authError.set(error.message);
      }
    } catch (e: any) {
      this.authError.set(e.message || 'An unknown error occurred.');
    } finally {
      this.isSigningIn.set(false);
    }
  }

  handleLogout() {
    this.authService.signOut();
  }

  async selectChannel(channel: Channel) {
    if (this.currentChannel()?.id === channel.id) {
      // Already in this channel, do nothing or disconnect
      this.voiceChannelService.leaveChannel();
    } else {
      try {
        await this.voiceChannelService.joinChannel(channel);
      } catch (error) {
        console.error('Error joining channel:', error);
        alert('Could not join channel. Please ensure microphone permissions are granted.');
      }
    }
  }

  leaveChannel() {
    this.voiceChannelService.leaveChannel();
  }

  toggleMute() {
    this.voiceChannelService.toggleMute();
  }

  // Helper to get a user-friendly name from a member object
  getMemberName(member: { user_id: string; users: { email: string } | null }): string {
    return member.users?.email?.split('@')[0] || 'Unknown User';
  }

   getAvatarInitial(member: { users: { email: string } | null }): string {
    return member.users?.email?.[0].toUpperCase() || '?';
  }
}
