/**
 * Application Type Definitions
 */

export interface UserSession {
  id: string;
  name: string;
  email: string;
  token: string;
  uid: string;
  picture?: string;
}

export interface CircleRoom {
  id: string;
  name: string;
  surahNumber: number;
  creatorEmail?: string;
  creatorName?: string;
  members: string[];
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  text: string;
  t: number;
  excuse?: boolean;
}

export interface PeerParticipant {
  id: string;
  name: string;
  uid: string;
  isMe?: boolean;
  isMuted?: boolean;
  isSpeaking?: boolean;
  hasVideo?: boolean;
  stream?: MediaStream | null;
  lastRecitedText?: string;
  role?: 'reciter' | 'listener';
}

export interface BreakoutPairAssignment {
  roomNumber: number;
  roomId: string;
  user1Email: string;
  user1Name: string;
  user2Email: string;
  user2Name: string;
}

export interface BreakoutPeerStatus {
  id: string;
  email: string;
  name: string;
  location: 'lobby' | 'pair_room';
  pairRoomNumber?: number;
  partnerName?: string;
  partnerEmail?: string;
  role?: 'reciter' | 'listener';
  isCamOn: boolean;
  isMicOn: boolean;
}

