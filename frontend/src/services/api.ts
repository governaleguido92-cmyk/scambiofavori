// Production backend URL - fallback to deployed URL if env var is empty
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://granelli-app-1.preview.emergentagent.com';

// Helper to get full URL for uploaded images
export const getImageUrl = (path: string | undefined | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
};

// Currency renamed to "Granelli" 💎
export const CURRENCY_NAME = "Granelli";
export const CURRENCY_SYMBOL = "💎";

// Ethical tags for reviews
export interface EthicalTag {
  id: string;
  label: string;
  icon: string;
}

// Chat Messages
export interface ChatMessage {
  message_id: string;
  favor_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_system: boolean;
  blocked: boolean;
  created_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earned_at?: string;
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  granelli: number;  // Renamed to Granelli
  total_favors_given: number;
  total_favors_received: number;
  micro_favors_completed: number;
  emergencies_helped: number;
  total_hours_helped: number;
  total_donations: number;
  average_rating: number;
  average_kindness: number;
  average_impact: number;
  perfect_reviews_count: number;
  referral_code: string;
  referred_by?: string;
  successful_referrals: number;
  badges: string[];
  title: string;
  is_vulnerable: boolean;
  identity_verified: boolean;
  community_score: number;
  social_impact_score: number;  // New: Social Impact Bar
  can_access_solidarity_fund: boolean;
  is_supporter: boolean;  // Supporter subscription status
  // Social Debt Limit fields
  reliability_score: number;
  debt_start_date?: string;
  last_activity_date?: string;
  in_debt_recovery: boolean;
  approximate_latitude?: number;
  approximate_longitude?: number;
  neighborhood?: string;
  created_at: string;
}

export interface Category {
  name: string;
  icon: string;
  is_micro: boolean;
}

export interface ObjectCategory {
  name: string;
  icon: string;
}

export interface Favor {
  favor_id: string;
  creator_id: string;
  creator_name: string;
  creator_title: string;
  creator_is_supporter: boolean;  // For golden badge display
  type: 'offer' | 'request';
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  granelli_cost: number;  // Renamed from credits_cost
  status: 'active' | 'accepted' | 'completed' | 'cancelled';
  accepted_by?: string;
  accepted_by_name?: string;
  approximate_latitude?: number;
  approximate_longitude?: number;
  exact_latitude?: number;
  exact_longitude?: number;
  address?: string;
  distance_km?: number;
  is_micro: boolean;
  is_emergency: boolean;
  creator_in_debt: boolean;  // For priority highlighting
  validity_days: number;  // Durata annuncio (1-10 giorni)
  expires_at?: string;  // Data scadenza
  qr_code?: string;
  checkin_completed: boolean;
  created_at: string;
  completed_at?: string;
}

// Debt Status Response
export interface DebtStatus {
  granelli: number;
  in_debt: boolean;
  can_request: boolean;
  debt_limit: number;
  reliability_score: number;
  in_debt_recovery: boolean;
  message?: string;
}

export interface LendableObject {
  object_id: string;
  owner_id: string;
  owner_name: string;
  owner_title: string;
  name: string;
  description: string;
  category: string;
  deposit_granelli: number;
  status: 'available' | 'borrowed' | 'unavailable';
  borrowed_by?: string;
  borrowed_by_name?: string;
  approximate_latitude?: number;
  approximate_longitude?: number;
  distance_km?: number;
  borrow_date?: string;
  return_date?: string;
  created_at: string;
}

export interface WallPost {
  post_id: string;
  author_id: string;
  author_name: string;
  author_title: string;
  content: string;
  post_type: 'general' | 'thanks' | 'announcement';
  likes: number;
  liked_by: string[];
  approximate_latitude?: number;
  approximate_longitude?: number;
  distance_km?: number;
  created_at: string;
}

export interface ThanksEntry {
  thanks_id: string;
  favor_id: string;
  favor_title: string;
  giver_id: string;
  giver_name: string;
  receiver_id: string;
  receiver_name: string;
  message: string;
  created_at: string;
}

export interface Review {
  review_id: string;
  favor_id: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewed_id: string;
  rating: number;
  kindness_rating: number;
  impact_rating: number;
  comment?: string;
  public_thanks?: string;
  created_at: string;
}

export interface Donation {
  donation_id: string;
  donor_id: string;
  donor_name: string;
  recipient_id?: string;
  recipient_name?: string;
  amount: number;
  message?: string;
  is_solidarity_fund: boolean;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  requiresVerification?: boolean;
  userId?: string;
}

export interface FavorCreateData {
  type: 'offer' | 'request';
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  validity_days?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  is_micro?: boolean;
  is_emergency?: boolean;
}

export interface ChatStatus {
  status: string;
  read_only: boolean;
  read_only_reason: string | null;
  favor_status: string;
  favor_title: string;
  granelli_cost: number;
}

export interface ObjectCreateData {
  name: string;
  description: string;
  category: string;
  deposit_granelli: number;
  latitude?: number;
  longitude?: number;
}

export interface WallPostCreateData {
  content: string;
  post_type: 'general' | 'thanks' | 'announcement';
  latitude?: number;
  longitude?: number;
}

export interface LeaderboardUser {
  user_id: string;
  name: string;
  title: string;
  community_score: number;
  badges: string[];
  total_favors_given: number;
}

export interface Notification {
  notification_id: string;
  user_id: string;
  type: string; // "skill_match", "favor_update", "system", "new_message", "favor_completed"
  title: string;
  message: string;
  favor_id?: string;
  related_id?: string;
  read: boolean;
  created_at: string;
}

export interface PattoContent {
  title: string;
  subtitle: string;
  encouraged: Array<{ title: string; icon: string; description: string }>;
  forbidden: Array<{ title: string; icon: string; description: string }>;
  currency_explanation: {
    name: string;
    symbol: string;
    meaning: string;
    exchange_rate: string;
  };
}

export interface CurrencyInfo {
  name: string;
  symbol: string;
  welcome_bonus: number;
  per_hour: number;
  referral_bonus: number;
  explanation: {
    name: string;
    symbol: string;
    meaning: string;
    exchange_rate: string;
  };
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Errore di rete' }));
    throw new Error(error.detail || 'Si è verificato un errore');
  }
  return response.json();
};

const getHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true', // Required for localtunnel
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  register: async (email: string, password: string, name: string, referralCode?: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password, name, referral_code: referralCode }),
    });
    return handleResponse(response);
  },

  verifyEmailCode: async (userId: string, code: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId, code }),
    });
    return handleResponse(response);
  },

  resendVerificationCode: async (userId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/auth/resend-code`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ user_id: userId }),
    });
    return handleResponse(response);
  },

  exchangeSession: async (sessionId: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/session`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ session_id: sessionId }),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  appleAuth: async (identityToken: string, userId: string, email?: string, fullName?: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/apple`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ 
        identity_token: identityToken, 
        user_id: userId,
        email: email,
        full_name: fullName
      }),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  getMe: async (token: string): Promise<User> => {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: getHeaders(token),
      credentials: 'include',
    });
    return handleResponse(response);
  },

  logout: async (token: string): Promise<void> => {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: getHeaders(token),
      credentials: 'include',
    });
  },

  // Categories
  getCategories: async (): Promise<Category[]> => {
    const response = await fetch(`${API_URL}/api/categories`);
    return handleResponse(response);
  },

  getObjectCategories: async (): Promise<ObjectCategory[]> => {
    const response = await fetch(`${API_URL}/api/object-categories`);
    return handleResponse(response);
  },

  // Badges
  getAllBadges: async (): Promise<Badge[]> => {
    const response = await fetch(`${API_URL}/api/badges`);
    return handleResponse(response);
  },

  getMyBadges: async (token: string): Promise<Badge[]> => {
    const response = await fetch(`${API_URL}/api/badges/my`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Ethical Tags for Reviews
  getEthicalTags: async (): Promise<EthicalTag[]> => {
    const response = await fetch(`${API_URL}/api/ethical-tags`);
    return handleResponse(response);
  },

  // Social Debt Limit System
  getDebtStatus: async (token: string): Promise<DebtStatus> => {
    const response = await fetch(`${API_URL}/api/debt-status`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  requestDebtRecovery: async (token: string): Promise<{ success: boolean; amount_received: number; new_balance: number; returned_positive: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/api/debt-recovery/request`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Chat Messages
  getMessages: async (favorId: string, token: string): Promise<ChatMessage[]> => {
    const response = await fetch(`${API_URL}/api/messages/${favorId}`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  sendMessage: async (favorId: string, content: string, token: string): Promise<any> => {
    const response = await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ favor_id: favorId, content }),
    });
    return handleResponse(response);
  },

  getChatStatus: async (favorId: string, token: string): Promise<ChatStatus> => {
    const response = await fetch(`${API_URL}/api/chat/status/${favorId}`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  reportUserInChat: async (
    favorId: string, 
    reportedUserId: string, 
    reason: string, 
    description: string,
    token: string
  ): Promise<{ message: string; report_id: string }> => {
    const response = await fetch(`${API_URL}/api/chat/report`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        favor_id: favorId,
        reported_user_id: reportedUserId,
        reason,
        description,
      }),
    });
    return handleResponse(response);
  },

  getUnreadCount: async (favorId: string, token: string): Promise<{ unread: number }> => {
    const response = await fetch(`${API_URL}/api/messages/${favorId}/unread`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Il Nostro Patto
  getPatto: async (): Promise<PattoContent> => {
    const response = await fetch(`${API_URL}/api/patto`);
    return handleResponse(response);
  },

  // Currency Info
  getCurrencyInfo: async (): Promise<CurrencyInfo> => {
    const response = await fetch(`${API_URL}/api/currency`);
    return handleResponse(response);
  },

  // Muro del Quartiere (Neighborhood Wall)
  getWallPosts: async (latitude?: number, longitude?: number, radiusKm: number = 0.5, postType?: string): Promise<WallPost[]> => {
    const params = new URLSearchParams();
    if (latitude) params.append('latitude', String(latitude));
    if (longitude) params.append('longitude', String(longitude));
    params.append('radius_km', String(radiusKm));
    if (postType) params.append('post_type', postType);
    const response = await fetch(`${API_URL}/api/wall?${params}`);
    return handleResponse(response);
  },

  createWallPost: async (data: WallPostCreateData, token: string): Promise<WallPost> => {
    const response = await fetch(`${API_URL}/api/wall`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  likeWallPost: async (postId: string, token: string): Promise<{ liked: boolean }> => {
    const response = await fetch(`${API_URL}/api/wall/${postId}/like`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Oggettoteca (Object Lending)
  getObjects: async (params?: {
    category?: string;
    status?: string;
    latitude?: number;
    longitude?: number;
    max_distance_km?: number;
  }): Promise<LendableObject[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
    }
    const url = `${API_URL}/api/objects${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await fetch(url);
    return handleResponse(response);
  },

  getMyObjects: async (token: string): Promise<LendableObject[]> => {
    const response = await fetch(`${API_URL}/api/objects/my`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  createObject: async (data: ObjectCreateData, token: string): Promise<LendableObject> => {
    const response = await fetch(`${API_URL}/api/objects`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  borrowObject: async (objectId: string, token: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/objects/borrow`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ object_id: objectId }),
    });
    return handleResponse(response);
  },

  returnObject: async (objectId: string, condition: 'good' | 'damaged', token: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/objects/return`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ object_id: objectId, condition }),
    });
    return handleResponse(response);
  },

  // Favors
  getFavors: async (params?: {
    type?: string;
    category?: string;
    status?: string;
    is_micro?: boolean;
    is_emergency?: boolean;
    latitude?: number;
    longitude?: number;
    max_distance_km?: number;
  }): Promise<Favor[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
    }
    const url = `${API_URL}/api/favors${searchParams.toString() ? `?${searchParams}` : ''}`;
    const response = await fetch(url);
    return handleResponse(response);
  },

  getEmergencies: async (latitude: number, longitude: number, token: string): Promise<Favor[]> => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    });
    const response = await fetch(`${API_URL}/api/favors/emergencies?${params}`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getFavor: async (favorId: string, token?: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}`, {
      headers: token ? getHeaders(token) : {},
    });
    return handleResponse(response);
  },

  getMyFavors: async (token: string): Promise<Favor[]> => {
    const response = await fetch(`${API_URL}/api/favors/my`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  createFavor: async (data: FavorCreateData, token: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  acceptFavor: async (favorId: string, token: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors/accept`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ favor_id: favorId }),
    });
    return handleResponse(response);
  },

  completeFavor: async (favorId: string, token: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors/complete`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ favor_id: favorId }),
    });
    return handleResponse(response);
  },

  cancelFavor: async (favorId: string, token: string): Promise<void> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Reviews & Bacheca dei Grazie
  createReview: async (
    favorId: string,
    rating: number,
    kindnessRating: number,
    impactRating: number,
    comment: string | undefined,
    publicThanks: string | undefined,
    token: string
  ): Promise<Review> => {
    const response = await fetch(`${API_URL}/api/reviews`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        favor_id: favorId,
        rating,
        kindness_rating: kindnessRating,
        impact_rating: impactRating,
        comment,
        public_thanks: publicThanks,
      }),
    });
    return handleResponse(response);
  },

  getThanksBoard: async (limit: number = 20): Promise<ThanksEntry[]> => {
    const response = await fetch(`${API_URL}/api/thanks?limit=${limit}`);
    return handleResponse(response);
  },

  getFavorReviews: async (favorId: string): Promise<Review[]> => {
    const response = await fetch(`${API_URL}/api/reviews/favor/${favorId}`);
    return handleResponse(response);
  },

  getUserReviews: async (userId: string): Promise<Review[]> => {
    const response = await fetch(`${API_URL}/api/reviews/user/${userId}`);
    return handleResponse(response);
  },

  // Donations
  createDonation: async (amount: number, recipientId?: string, message?: string, token?: string): Promise<Donation> => {
    const response = await fetch(`${API_URL}/api/donations`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ amount, recipient_id: recipientId, message }),
    });
    return handleResponse(response);
  },

  getSolidarityFund: async (): Promise<{ solidarity_fund_total: number; currency: string }> => {
    const response = await fetch(`${API_URL}/api/donations/fund`);
    return handleResponse(response);
  },

  getMyDonations: async (token: string): Promise<Donation[]> => {
    const response = await fetch(`${API_URL}/api/donations/my`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Users
  getUserProfile: async (userId: string): Promise<User> => {
    const response = await fetch(`${API_URL}/api/users/${userId}`);
    return handleResponse(response);
  },

  getLeaderboard: async (): Promise<LeaderboardUser[]> => {
    const response = await fetch(`${API_URL}/api/leaderboard`);
    return handleResponse(response);
  },

  // Referral
  getReferralCode: async (token: string): Promise<{ referral_code: string; successful_referrals: number; bonus_per_referral: number; currency: string }> => {
    const response = await fetch(`${API_URL}/api/referral/code`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // QR Code (for favor check-in)
  getFavorQR: async (favorId: string, token: string): Promise<{ 
    qr_code: string; 
    qr_image: string;
    favor_id: string;
    favor_title: string;
    instructions: string;
  }> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}/qr-image`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  verifyAndCompleteQR: async (favorId: string, scannedCode: string, token: string): Promise<{
    message: string;
    favor_id: string;
    granelli_earned: number;
  }> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}/verify-qr`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ qr_code: scannedCode }),
    });
    return handleResponse(response);
  },

  // ========================
  // LEGAL & GDPR
  // ========================
  
  acceptLegalTerms: async (token: string): Promise<{ message: string; legal_accepted: boolean }> => {
    const response = await fetch(`${API_URL}/api/legal/accept`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getLegalStatus: async (token: string): Promise<{ legal_accepted: boolean; legal_accepted_at: string | null }> => {
    const response = await fetch(`${API_URL}/api/legal/status`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  deleteAccount: async (confirmEmail: string, reason: string | undefined, token: string): Promise<{ message: string; details: string }> => {
    const response = await fetch(`${API_URL}/api/account`, {
      method: 'DELETE',
      headers: getHeaders(token),
      body: JSON.stringify({ confirm_email: confirmEmail, reason }),
    });
    return handleResponse(response);
  },

  // ========================
  // SKILLS & NOTIFICATIONS
  // ========================
  
  updateUserSkills: async (skills: string[], token: string): Promise<{ message: string; skills: string[] }> => {
    const response = await fetch(`${API_URL}/api/user/skills`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ skills }),
    });
    return handleResponse(response);
  },

  getUserSkills: async (token: string): Promise<{ skills: string[] }> => {
    const response = await fetch(`${API_URL}/api/user/skills`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getNotifications: async (token: string): Promise<any[]> => {
    const response = await fetch(`${API_URL}/api/notifications`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  markNotificationRead: async (notificationId: string, token: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/notifications/read/${notificationId}`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getUnreadNotificationsCount: async (token: string): Promise<{ unread_count: number }> => {
    const response = await fetch(`${API_URL}/api/notifications/unread-count`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // ========================
  // REPORTING & BLOCKING (Store Compliance)
  // ========================

  reportContent: async (
    reportType: 'favor' | 'user',
    targetId: string,
    reason: string,
    description: string | undefined,
    token: string
  ): Promise<{ message: string; report_id: string }> => {
    const response = await fetch(`${API_URL}/api/report`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ report_type: reportType, target_id: targetId, reason, description }),
    });
    return handleResponse(response);
  },

  blockUser: async (userId: string, reason: string | undefined, token: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/users/block`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ user_id: userId, reason }),
    });
    return handleResponse(response);
  },

  unblockUser: async (userId: string, token: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_URL}/api/users/block/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getBlockedUsers: async (token: string): Promise<{ blocked_users: Array<{ user_id: string; name: string; title: string }> }> => {
    const response = await fetch(`${API_URL}/api/users/blocked`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  checkIfBlocked: async (userId: string, token: string): Promise<{ is_blocked: boolean }> => {
    const response = await fetch(`${API_URL}/api/users/${userId}/is-blocked`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // ========================
  // PROFILE COMPLETION
  // ========================

  getProfileCompletion: async (token: string): Promise<{
    percentage: number;
    items: Array<{ id: string; label: string; completed: boolean; points: number }>;
    completed_count: number;
    total_count: number;
    badge_earned: boolean;
    badge_name: string | null;
  }> => {
    const response = await fetch(`${API_URL}/api/users/me/profile-completion`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // ========================
  // DEBUG/REVIEWER MODE (Store Approval)
  // ========================

  isReviewerAccount: async (token: string): Promise<{
    is_reviewer: boolean;
    debug_features_enabled: boolean;
    features: string[];
  }> => {
    const response = await fetch(`${API_URL}/api/debug/is-reviewer`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  mockQrScan: async (favorId: string, token: string): Promise<{
    message: string;
    favor_id: string;
    granelli_transferred: number;
    debug_mode: boolean;
  }> => {
    const response = await fetch(`${API_URL}/api/debug/mock-qr-scan?favor_id=${favorId}`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // ========================
  // SUPPORTER SUBSCRIPTION
  // ========================

  createSubscriptionCheckout: async (originUrl: string, token: string): Promise<{
    checkout_url: string;
    session_id: string;
  }> => {
    const response = await fetch(`${API_URL}/api/subscription/create-checkout`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ origin_url: originUrl }),
    });
    return handleResponse(response);
  },

  getCheckoutStatus: async (sessionId: string, token: string): Promise<{
    status: string;
    payment_status: string;
    message: string;
    is_supporter?: boolean;
  }> => {
    const response = await fetch(`${API_URL}/api/subscription/status/${sessionId}`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getMySubscriptionStatus: async (token: string): Promise<{
    is_supporter: boolean;
    subscription_status: string | null;
    supporter_since: string | null;
    subscription_id: string | null;
  }> => {
    const response = await fetch(`${API_URL}/api/subscription/my-status`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getSubscriptionManageUrl: async (token: string): Promise<{
    manage_url: string;
    message: string;
  }> => {
    const response = await fetch(`${API_URL}/api/subscription/manage-url`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Debug/Reviewer API
  checkReviewerStatus: async (token: string): Promise<{
    is_reviewer: boolean;
    debug_features_enabled: boolean;
    features: string[];
  }> => {
    const response = await fetch(`${API_URL}/api/debug/is-reviewer`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  mockQRScan: async (favorId: string, token: string): Promise<{
    message: string;
    favor_id: string;
    debug_mode: boolean;
  }> => {
    const response = await fetch(`${API_URL}/api/debug/mock-qr-scan?favor_id=${favorId}`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Profile Picture Upload
  uploadProfilePicture: async (imageUri: string, token: string): Promise<{ picture: string }> => {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type,
    } as any);

    const response = await fetch(`${API_URL}/api/users/me/picture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return handleResponse(response);
  },
};
