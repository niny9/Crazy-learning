
export enum AppMode {
  DASHBOARD = 'DASHBOARD',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  READING = 'READING',
  WRITING = 'WRITING',
  EXAM_PORTAL = 'EXAM_PORTAL',
  STORY_LIBRARY = 'STORY_LIBRARY',
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
  language?: string;
}

export type TodayStoryMode = 'zh' | 'mixed' | 'en';

export interface StoryPhrase {
  original: string;
  explanation: string;
  alternative: string;
}

export interface TodayStoryResult {
  title: string;
  original: string;
  rewritten: string;
  keyPhrases: StoryPhrase[];
  comment?: string;
  tags?: string[];
}

export interface TodayStoryEntry {
  id: string;
  date: string;
  title: string;
  mode: TodayStoryMode;
  originalText: string;
  rewrittenText: string;
  keyPhrases: StoryPhrase[];
  comment?: string;
  tags?: string[];
  language?: string;
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

export interface CustomExamLink {
  id: string;
  language: string;
  name: string;
  url: string;
  description: string;
}
