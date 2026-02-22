const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  credits: number;
  total_favors_given: number;
  total_favors_received: number;
  average_rating: number;
  created_at: string;
}

export interface Category {
  name: string;
  icon: string;
}

export interface Favor {
  favor_id: string;
  creator_id: string;
  creator_name: string;
  type: 'offer' | 'request';
  title: string;
  description: string;
  category: string;
  credits_cost: number;
  status: 'active' | 'accepted' | 'completed' | 'cancelled';
  accepted_by?: string;
  accepted_by_name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  distance_km?: number;
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
  comment?: string;
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
  credits_cost: number;
  latitude?: number;
  longitude?: number;
  address?: string;
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Errore di rete' }));
    throw new Error(error.detail || 'Si \u00e8 verificato un errore');
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

  register: async (email: string, password: string, name: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password, name }),
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

  // Favors
  getFavors: async (params?: {
    type?: string;
    category?: string;
    status?: string;
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

  getFavor: async (favorId: string): Promise<Favor> => {
    const response = await fetch(`${API_URL}/api/favors/${favorId}`);
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

  // Reviews
  createReview: async (
    favorId: string,
    rating: number,
    comment: string | undefined,
    token: string
  ): Promise<Review> => {
    const response = await fetch(`${API_URL}/api/reviews`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ favor_id: favorId, rating, comment }),
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

  // Users
  getUserProfile: async (userId: string): Promise<User> => {
    const response = await fetch(`${API_URL}/api/users/${userId}`);
    return handleResponse(response);
  },
};
