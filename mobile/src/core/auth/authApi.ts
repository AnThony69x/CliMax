const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export type AuthResponse = {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
};

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (!apiUrl) {
    throw new Error('API backend no configurada');
  }

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('No se pudo iniciar sesion');
  }

  return response.json();
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  if (!apiUrl) {
    throw new Error('API backend no configurada');
  }

  const response = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    throw new Error('No se pudo registrar');
  }

  return response.json();
}
