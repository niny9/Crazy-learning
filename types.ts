
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  READING = 'READING',
  WRITING = 'WRITING',
  EXAM_PORTAL = 'EXAM_PORTAL',
}

export interface VocabItem {
  id: string;
  word: string;
  definition: string;
  chineseDefinition?: string;
  contextSentence: string;
  dateAdded: string;
  imageUrl?: string;
  masteryLevel?: number; // 0 = new, 1 = reviewing, 2 = mastered
  language?: string;
}

export interface SavedSentence {
  id: string;
  text: string;
  source: string; 
  notes?: string;
  dateAdded: string;
  scenario?: string;
  advancedVersion?: string;
  language?: string;
}

export interface DailyContent {
  title: string;
  summary: string;
  url: string;
  content: string; 
  source: string;
}

export interface VideoContent {
  transcript: string;
  summary: string;
  keyPoints: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string;
  isCorrection?: boolean;
  feedback?: SpeakingFeedback;
}

export interface WritingFeedback {
  original: string;
  corrected: string;
  upgraded: string; 
  modelEssay: string;
}

export interface WritingEntry {
  id: string;
  date: string;
  topic: string;
  original: string;
  feedback: WritingFeedback;
}

export interface DiaryEntry {
  id: string;
  date: string;
  topic: string;
  title: string;
  content: string;
  sourceLabel: 'Corrected' | 'Pro Upgrade' | 'Model Essay';
  language?: string;
}

export interface SpeakingScenario {
  id: string;
  title: string;
  description: string;
  icon: any;
  prompt: string;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface SceneContext {
  objects: string[];
  environmentTag: string;
  intentTag?: string;
  timeOfDay?: TimeOfDay;
  persona?: string;
}

export interface SceneHint {
  title: string;
  suggestions: string[];
}

export interface SpeakingFeedback {
  summary: string;
  suggestedSentence?: string;
  tags?: ('fluency' | 'accuracy' | 'vocabulary')[];
  level?: 'easy' | 'medium' | 'hard';
}

export interface SceneWord {
  word: string;
  meaning: string;
  chineseHint?: string;
  example: string;
}

export interface SpeakingTurnPayload {
  context: SceneContext;
  hint: SceneHint;
  reply: string;
  feedback: SpeakingFeedback;
  words?: SceneWord[];
  nextPrompt?: string;
  intentUpdated?: string;
}

export interface SpeakingReport {
  feedback: string;
  improvements: string[];
  vocabulary: { word: string; definition: string }[];
  betterResponses: { original: string; improved: string; explanation: string }[];
}

export interface CustomExamLink {
  id: string;
  language: string;
  name: string;
  url: string;
  description: string;
}
