import { API_BASE_URL, API_URL } from './apiConfig';
import { fetchAddressForCoords, fetchWeatherForCoords } from '../weather/weatherDataCache';

export { API_BASE_URL, API_URL };

export async function fetchWeather(lat: number, lon: number) {
  return fetchWeatherForCoords({ latitude: lat, longitude: lon });
}

export async function fetchAddress(lat: number, lon: number) {
  const displayName = await fetchAddressForCoords({ latitude: lat, longitude: lon });
  return { display_name: displayName };
}

export async function searchCities(query: string, count = 10) {
  const response = await fetch(
    `${API_URL}/search?city=${encodeURIComponent(query)}&count=${count}`
  );
  if (!response.ok) throw new Error('Error searching cities');
  return response.json() as Promise<{ results: { id: string; name: string; country: string; lat: number; lon: number }[] }>;
}

export async function saveLocation(data: {
  latitude: number;
  longitude: number;
  address?: string;
  temperature?: number;
  weather_code?: number;
  wind_speed?: number;
}, token?: string | null) {
  const response = await fetch(`${API_URL}/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...data,
      captured_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error('Error saving location');
  return response.json();
}

export async function getProfile(token: string) {
  const response = await fetch(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching profile');
  return response.json();
}

export async function updateProfile(data: { name?: string; avatar_url?: string }, token: string) {
  const response = await fetch(`${API_URL}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating profile');
  return response.json();
}

export async function fetchAdminDashboard(token: string) {
  const response = await fetch(`${API_URL}/admin/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching admin dashboard');
  return response.json();
}

export async function fetchAdminUsers(token: string) {
  const response = await fetch(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching admin users');
  return response.json();
}

export async function fetchAuditLogs(token: string) {
  const response = await fetch(`${API_URL}/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching audit logs');
  return response.json();
}

export async function updateUserRole(userId: string, role: 'admin' | 'operator' | null, token: string) {
  const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error('Error updating user role');
  return response.json();
}

export async function updateUserSubscription(
  userId: string,
  data: { plan: 'free' | 'premium' | 'professional'; professional_sector?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/admin/users/${userId}/subscription`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating subscription');
  return response.json();
}

export async function fetchAdminPlans(token: string) {
  const response = await fetch(`${API_URL}/admin/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching admin plans');
  return response.json();
}

export async function updateAdminPlan(
  planKey: 'free' | 'premium' | 'professional',
  data: {
    name?: string;
    description?: string | null;
    currency?: string;
    monthly_price_cents?: number;
    yearly_price_cents?: number;
    stripe_monthly_price_id?: string | null;
    stripe_yearly_price_id?: string | null;
    is_active?: boolean;
  },
  token: string
) {
  const response = await fetch(`${API_URL}/admin/plans/${planKey}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating plan');
  return response.json();
}

export async function fetchBillingPlans(token: string) {
  const response = await fetch(`${API_URL}/billing/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching billing plans');
  return response.json();
}

export async function createBillingCheckout(
  data: {
    plan: 'free' | 'premium' | 'professional';
    billing_interval: 'month' | 'year';
    success_url?: string;
    cancel_url?: string;
  },
  token: string
) {
  const response = await fetch(`${API_URL}/billing/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error creating checkout');
  return response.json();
}

export async function syncBillingCheckout(checkoutSessionId: number, token: string) {
  const response = await fetch(`${API_URL}/billing/sync-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ checkout_session_id: checkoutSessionId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Error syncing checkout');
  }
  return response.json();
}

export async function simulateBillingSuccess(checkoutSessionId: number, token: string) {
  const response = await fetch(`${API_URL}/billing/simulate-success`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ checkout_session_id: checkoutSessionId }),
  });
  if (!response.ok) throw new Error('Error simulating checkout');
  return response.json();
}

export async function fetchOperatorUsers(token: string) {
  const response = await fetch(`${API_URL}/operator/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching operator users');
  return response.json();
}

export type AccountModerationStatus = 'active' | 'suspended' | 'banned' | 'deleted';

export async function updateUserAccountStatus(
  userId: string,
  data: { status: AccountModerationStatus; reason?: string | null; suspended_until?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/operator/users/${userId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Error updating user account status');
  }
  return response.json();
}

export async function fetchOperatorPosts(token: string) {
  const response = await fetch(`${API_URL}/operator/community/posts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching operator posts');
  return response.json();
}

export type ModerationStatus = 'pending_review' | 'published' | 'hidden' | 'flagged' | 'removed' | 'rejected';

export async function moderateCommunityPost(
  postId: string,
  data: { moderation_status: ModerationStatus; moderation_reason?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/operator/community/posts/${postId}/moderation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error moderating post');
  return response.json();
}

export async function moderateCommunityComment(
  commentId: string,
  data: { moderation_status: ModerationStatus; moderation_reason?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/operator/community/comments/${commentId}/moderation`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error moderating comment');
  return response.json();
}

export async function fetchCommunityFeed(token: string) {
  const response = await fetch(`${API_URL}/community/posts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching community feed');
  return response.json();
}

export async function createCommunityPost(
  data: {
    content: string;
    image_url: string;
    image_path?: string | null;
    image_mime_type?: string | null;
    image_size_bytes?: number | null;
    severity: 'informacion' | 'alerta' | 'grave';
    initial_comment?: string | null;
  },
  token: string
) {
  const response = await fetch(`${API_URL}/community/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error creating community post');
  return response.json();
}

export async function updateCommunityPost(
  postId: string,
  data: {
    content: string;
    image_url?: string | null;
    image_path?: string | null;
    image_mime_type?: string | null;
    image_size_bytes?: number | null;
    severity: 'informacion' | 'alerta' | 'grave';
  },
  token: string
) {
  const response = await fetch(`${API_URL}/community/posts/${postId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating community post');
  return response.json();
}

export async function deleteCommunityPost(postId: string, token: string) {
  const response = await fetch(`${API_URL}/community/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error deleting community post');
  return response.json();
}

export async function createCommunityComment(
  postId: string,
  data: { content: string; parent_comment_id?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error creating community comment');
  return response.json();
}

export async function updateCommunityComment(
  postId: string,
  commentId: string,
  data: { content: string },
  token: string
) {
  const response = await fetch(`${API_URL}/community/posts/${postId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating community comment');
  return response.json();
}

export async function deleteCommunityComment(postId: string, commentId: string, token: string) {
  const response = await fetch(`${API_URL}/community/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error deleting community comment');
  return response.json();
}

export async function reportCommunityContent(
  data: { target_type: 'post' | 'comment'; target_id: string; reason: string; details?: string | null },
  token: string
) {
  const response = await fetch(`${API_URL}/community/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error reporting community content');
  return response.json();
}

export async function fetchWeatherHistorySummary(
  lat: number,
  lon: number,
  range: '30d' | '90d' | '180d' | '365d',
  token: string
) {
  const response = await fetch(`${API_URL}/weather/history/summary?lat=${lat}&lon=${lon}&range=${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching weather history summary');
  return response.json();
}
