
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
  source: string; // Changed from union type to string to support various website names
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