import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI, setOnAuthExpired } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [booting, setBooting]               = useState(true);
  const [user, setUser]                     = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  const clearSession = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('selected_project');
    setUser(null);
    setSelectedProject(null);
  };

  useEffect(() => {
    // If the api client's refresh attempt fails (refresh token itself expired
    // after 8 hours), drop back to the login screen instead of leaving the
    // app stuck retrying a dead session.
    setOnAuthExpired(() => clearSession());

    (async () => {
      try {
        const token = await SecureStore.getItemAsync('auth_token');
        const proj  = await SecureStore.getItemAsync('selected_project');
        if (token) {
          const res = await authAPI.me();
          setUser(res.data?.data || res.data?.user || res.data);
          if (proj) setSelectedProject(JSON.parse(proj));
        }
      } catch {}
      setBooting(false);
    })();
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    const { accessToken, refreshToken, user: u } = res.data;
    await SecureStore.setItemAsync('auth_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    setUser(u);
  };

  const logout = async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) await authAPI.logout(refreshToken);
    } catch {}
    await clearSession();
  };

  const selectProject = async (project) => {
    await SecureStore.setItemAsync('selected_project', JSON.stringify(project));
    setSelectedProject(project);
  };

  const changeProject = async () => {
    await SecureStore.deleteItemAsync('selected_project');
    setSelectedProject(null);
  };

  return (
    <AuthContext.Provider value={{ booting, user, selectedProject, login, logout, selectProject, changeProject }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
