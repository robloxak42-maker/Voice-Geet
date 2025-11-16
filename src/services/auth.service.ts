import { Injectable, signal, effect, computed } from '@angular/core';
import { supabase } from '../supabase.client';
import { Session, User } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  session = signal<Session | null>(null);

  constructor() {
    supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });

    supabase.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
    });
  }

  async signUp(email: string, password: string): Promise<Error | null> {
    const { error } = await supabase.auth.signUp({ email, password });
    return error;
  }

  async signIn(email: string, password: string): Promise<Error | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.session.set(null);
  }
}
