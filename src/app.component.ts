import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './services/auth.service';
import { VoiceChannelService, Channel, ChannelMember } from './services/voice-channel.service';
import { User } from '@supabase/supabase-js';

@Component({
  selector: 'app-root',
  template: `<!-- Main container -->
<div class="flex h-screen w-screen bg-gray-800 text-gray-100">
  @if (!session()) {
    <!-- Login View -->
    <div class="flex items-center justify-center w-full h-full">
      <div class="w-full max-w-sm p-8 space-y-6 bg-gray-900 rounded-lg shadow-lg">
        <div class="text-center">
          <h1 class="text-3xl font-bold text-white">Voice Channels</h1>
          <p class="text-gray-400">Sign in to talk with friends</p>
        </div>
        <form (ngSubmit)="handleLogin()" class="space-y-4">
          <div>
            <label for="email" class="text-sm font-medium text-gray-300">Email</label>
            <input id="email" type="email" [ngModel]="email()" (ngModelChange)="email.set($event)" name="email"
                   class="w-full px-3 py-2 mt-1 text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   placeholder="you@example.com" required>
          </div>
          <div>
            <label for="password" class="text-sm font-medium text-gray-300">Password</label>
            <input id="password" type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password"
                   class="w-full px-3 py-2 mt-1 text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   placeholder="••••••••" required>
          </div>
          @if (authError()) {
            <p class="text-sm text-red-400">{{ authError() }}</p>
          }
          <button type="submit" [disabled]="isSigningIn()"
                  class="w-full px-4 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-colors">
            {{ isSigningIn() ? 'Connecting...' : 'Sign In / Sign Up' }}
          </button>
        </form>
      </div>
    </div>
  } @else {
    <!-- Main App View -->
    <div class="flex flex-col w-64 bg-gray-900">
      <!-- Header -->
      <div class="flex items-center justify-between h-16 px-4 border-b border-gray-700 shadow-md">
        <h2 class="text-lg font-semibold">Channels</h2>
      </div>

      <!-- Channel List -->
      <nav class="flex-1 p-2 space-y-1 overflow-y-auto">
        @for (channel of channels(); track channel.id) {
          <a href="#" (click)="$event.preventDefault(); selectChannel(channel)"
             [class.bg-gray-700]="currentChannel()?.id === channel.id"
             class="flex items-center px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-700 transition-colors">
            <span class="mr-2 text-gray-400">#</span>
            <span class="truncate">{{ channel.name }}</span>
          </a>
        } @empty {
          <p class="px-3 py-2 text-sm text-gray-500">No channels found.</p>
        }
      </nav>

      <!-- User Panel -->
      <div class="flex items-center p-4 border-t border-gray-700">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ user()?.email }}</p>
        </div>
        <button (click)="handleLogout()" title="Logout" class="p-2 text-gray-400 rounded-md hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <main class="flex flex-col flex-1">
      @if (currentChannel()) {
        <!-- Channel Header -->
        <div class="flex items-center h-16 px-6 border-b border-gray-700 shadow-md">
          <h3 class="text-xl font-semibold"># {{ currentChannel()?.name }}</h3>
        </div>

        <!-- Members View -->
        <div class="flex-1 p-6 overflow-y-auto">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            @for (member of members(); track member.user_id) {
              <div class="flex flex-col items-center p-4 space-y-2 bg-gray-700 rounded-lg">
                <div class="relative">
                  <div class="flex items-center justify-center w-16 h-16 text-2xl font-bold text-white bg-indigo-500 rounded-full">
                    {{ getAvatarInitial(member) }}
                  </div>
                </div>
                <p class="text-base font-medium truncate">{{ getMemberName(member) }}</p>
              </div>
            } @empty {
              <div class="col-span-full text-center text-gray-500">
                <p>You're the first one here!</p>
              </div>
            }
          </div>
        </div>

        <!-- Connection Controls -->
        <div class="flex items-center h-20 px-6 bg-gray-900 border-t border-gray-700">
          @if (isLoadingChannel()) {
            <div class="flex items-center space-x-2">
               <div class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
               <div class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style="animation-delay: 0.2s;"></div>
               <div class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style="animation-delay: 0.4s;"></div>
               <span class="text-sm font-medium text-yellow-400">Connecting...</span>
            </div>
          } @else {
             <div class="flex items-center space-x-2">
                <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                <span class="text-sm font-medium text-green-400">Voice Connected</span>
             </div>
          }
          <div class="flex items-center ml-auto space-x-4">
            <button (click)="toggleMute()" [title]="isMuted() ? 'Unmute' : 'Mute'"
                    class="p-3 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white"
                    [class.bg-gray-600]="!isMuted()" [class.bg-red-600]="isMuted()">
              @if (isMuted()) {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7.5 7.5 0 01-7.5 7.5M2.5 11a7.5 7.5 0 0113.13-5.112M2.5 11h3.693a2.5 2.5 0 002.317-1.388L10 6.5M19 11h-3.039a2.5 2.5 0 01-2.316-1.388L12 6.5m0 0v11m0-11L10 2.5m2 4L14 2.5m-4 15l-1.293 1.293a1 1 0 01-1.414-1.414l14-14a1 1 0 011.414 1.414L3.707 17.707z" /></svg>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7.5 7.5 0 01-7.5 7.5m0 0a7.5 7.5 0 01-7.5-7.5m7.5 7.5v4.5m0-4.5l-2.5-2.5M2.5 11a7.5 7.5 0 017.5-7.5m0 0a2.5 2.5 0 012.5 2.5M10 2.5a2.5 2.5 0 00-2.5 2.5m-4.323 4.412a2.5 2.5 0 00-2.177 2.088h17.5a2.5 2.5 0 00-2.177-2.088l-1.28-4.482a2.5 2.5 0 00-2.316-1.612H9.097a2.5 2.5 0 00-2.316 1.612l-1.28 4.482z" /></svg>
              }
            </button>
            <button (click)="leaveChannel()" title="Disconnect" class="p-3 bg-red-600 rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2 2m-2-2v5a3 3 0 01-3 3H9a3 3 0 01-3-3V4m0 0l2 2m-2-2l-2 2" /></svg>
            </button>
          </div>
        </div>
      } @else {
        <div class="flex flex-col items-center justify-center h-full text-center text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
          <h3 class="text-xl font-medium">Select a channel</h3>
          <p>Choose a voice channel from the left to start talking.</p>
        </div>
      }
    </main>
    
    <!-- Audio elements for remote streams -->
    <div id="remote-audio">
      @for (stream of remoteStreams(); track stream.id) {
        <audio [srcObject]="stream" autoplay></audio>
      }
    </div>
  }
  <!-- App Version -->
  <div class="fixed bottom-2 right-3 text-xs text-gray-600 z-50">
    v{{ appVersion }}
  </div>
</div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [AuthService, VoiceChannelService],
})
export class AppComponent {
  authService = inject(AuthService);
  voiceChannelService = inject(VoiceChannelService);
  appVersion = '1.1.0';

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
