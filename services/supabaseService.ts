import { AuthChangeEvent, createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { DiaryEntry, SavedSentence, VocabItem, WritingEntry } from '../types';

type ItemType = 'vocab' | 'sentence' | 'diary' | 'writing_entry';

type LearningItemRecord = {
  item_type: ItemType;
  item_id: string;
  language: string | null;
  payload: VocabItem | SavedSentence | DiaryEntry | WritingEntry;
};

type UsageEventPayload = {
  eventType: string;
  payload: Record<string, unknown>;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;

const getClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
};

export const isSupabaseConfigured = () => Boolean(getClient());

export const getSupabaseUser = async (): Promise<User | null> => {
  const client = getClient();
  if (!client) return null;

  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return session?.user ?? null;
};

export const ensureSupabaseUser = async (): Promise<User | null> => {
  const client = getClient();
  if (!client) return null;

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session?.user) {
    return session.user;
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    throw error;
  }

  return data.user ?? null;
};

export const sendMagicLink = async (email: string) => {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    throw error;
  }
};

export const verifyEmailOtp = async (email: string, token: string) => {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase is not configured');
  }

  const { error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    throw error;
  }
};

export const signOutSupabase = async () => {
  const client = getClient();
  if (!client) return;

  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
};

export const subscribeToAuthChanges = (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
  const client = getClient();
  if (!client) {
    return { unsubscribe: () => {} };
  }

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(callback);

  return subscription;
};

const mapItem = (itemType: ItemType, item: VocabItem | SavedSentence | DiaryEntry | WritingEntry): LearningItemRecord => ({
  item_type: itemType,
  item_id: item.id,
  language: item.language ?? null,
  payload: item,
});

export const fetchLearningItems = async (userId: string) => {
  const client = getClient();
  if (!client) {
    return {
      vocab: [] as VocabItem[],
      sentences: [] as SavedSentence[],
      diaries: [] as DiaryEntry[],
      writingEntries: [] as WritingEntry[],
    };
  }

  const { data, error } = await client
    .from('learning_items')
    .select('item_type, item_id, language, payload')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const items = data ?? [];

  return {
    vocab: items.filter((item) => item.item_type === 'vocab').map((item) => item.payload as VocabItem),
    sentences: items.filter((item) => item.item_type === 'sentence').map((item) => item.payload as SavedSentence),
    diaries: items.filter((item) => item.item_type === 'diary').map((item) => item.payload as DiaryEntry),
    writingEntries: items.filter((item) => item.item_type === 'writing_entry').map((item) => item.payload as WritingEntry),
  };
};

export const replaceLearningItems = async (
  userId: string,
  itemType: ItemType,
  items: Array<VocabItem | SavedSentence | DiaryEntry | WritingEntry>
) => {
  const client = getClient();
  if (!client) return;

  const { error: deleteError } = await client.from('learning_items').delete().eq('user_id', userId).eq('item_type', itemType);
  if (deleteError) {
    throw deleteError;
  }

  if (!items.length) return;

  const payload = items.map((item) => ({
    user_id: userId,
    ...mapItem(itemType, item),
  }));

  const { error: insertError } = await client.from('learning_items').insert(payload);
  if (insertError) {
    throw insertError;
  }
};

export const trackUsageEvent = async (userId: string, event: UsageEventPayload) => {
  const client = getClient();
  if (!client) return;

  const { error } = await client.from('usage_events').insert({
    user_id: userId,
    event_type: event.eventType,
    payload: event.payload,
  });

  if (error) {
    throw error;
  }
};
