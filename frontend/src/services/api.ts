const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
  credits: number;
  total_favors_given: number;
  total_favors_received: number;
  micro_favors_completed: number;
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
  is_vulnerable: boolean;
  identity_verified: boolean;
  community_score: number;
  created_at: string;
}

export interface Category {
  name: string;
  icon: string;
  is_micro: boolean;
}

export interface Favor {
  favor_id: string;
  creator_id: string;
  creator_name: string;
  type: 'offer' | 'request';
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  credits_cost: number;
  status: 'active' | 'accepted' | 'completed' | 'cancelled';
  accepted_by?: string;
  accepted_by_name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  distance_km?: number;
  is_micro: boolean;
  qr_code?: string;
  checkin_completed: boolean;
  created_at: string;
  completed_at?: string;
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
}

export interface FavorCreateData {
  type: 'offer' | 'request';
  title: string;
  description: string;
  category: string;
  duration_hours: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  is_micro?: boolean;
}

export interface LeaderboardUser {
  user_id: string;
  name: string;
  community_score: number;
  badges: string[];
  total_favors_given: number;
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

  exchangeSession: async (sessionId: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/session`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ session_id: sessionId }),
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

  // Favors
  getFavors: async (params?: {
    type?: string;
    category?: string;
    status?: string;
    is_micro?: boolean;
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

  getNearbyFavors: async (latitude: number, longitude: number, radiusKm: number = 5, type?: string): Promise<Favor[]> => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radius_km: String(radiusKm),
    });
    if (type) params.append('type', type);
    const response = await fetch(`${API_URL}/api/favors/nearby?${params}`);
    return handleResponse(response);
  },

  getFavorSuggestions: async (latitude?: number, longitude?: number, token?: string): Promise<Favor[]> => {
    const params = new URLSearchParams();
    if (latitude) params.append('latitude', String(latitude));
    if (longitude) params.append('longitude', String(longitude));
    const response = await fetch(`${API_URL}/api/favors/suggestions?${params}`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getFavor: async (favorId: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}`);
    return handleResponse(response);
  },

  getFavorQR: async (favorId: string, token: string): Promise<{ qr_code: string }> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}/qr`, {
      headers: getHeaders(token),
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

  checkinFavor: async (favorId: string, qrCode: string, token: string): Promise<{ message: string; checkin_completed: boolean }> => {
    const response = await fetch(`${API_URL}/api/favors/checkin`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ favor_id: favorId, qr_code: qrCode }),
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

  // Reviews
  createReview: async (
    favorId: string,
    rating: number,
    kindnessRating: number,
    impactRating: number,
    comment: string | undefined,
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
      }),
    });
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

  getSolidarityFund: async (): Promise<{ solidarity_fund_total: number }> => {
    const response = await fetch(`${API_URL}/api/donations/fund`);
    return handleResponse(response);
  },

  getMyDonations: async (token: string): Promise<Donation[]> => {
    const response = await fetch(`${API_URL}/api/donations/my`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  claimSolidarityCredits: async (token: string): Promise<{ message: string; amount: number }> => {
    const response = await fetch(`${API_URL}/api/donations/claim`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  // Users
  getUserProfile: async (userId: string): Promise<User> => {
    const response = await fetch(`${API_URL}/api/users/${userId}`);
    return handleResponse(response);
  },

  updateMyProfile: async (isVulnerable?: boolean, token?: string): Promise<User> => {
    const params = new URLSearchParams();
    if (isVulnerable !== undefined) params.append('is_vulnerable', String(isVulnerable));
    const response = await fetch(`${API_URL}/api/users/me?${params}`, {
      method: 'PATCH',
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },

  getVulnerableUsers: async (): Promise<{ user_id: string; name: string; credits: number; community_score: number }[]> => {
    const response = await fetch(`${API_URL}/api/users/vulnerable/list`);
    return handleResponse(response);
  },

  getLeaderboard: async (): Promise<LeaderboardUser[]> => {
    const response = await fetch(`${API_URL}/api/leaderboard`);
    return handleResponse(response);
  },

  // Referral
  getReferralCode: async (token: string): Promise<{ referral_code: string; successful_referrals: number; bonus_per_referral: number }> => {
    const response = await fetch(`${API_URL}/api/referral/code`, {
      headers: getHeaders(token),
    });
    return handleResponse(response);
  },
};
