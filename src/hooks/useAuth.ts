import { useCallback, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { LOCAL_USER_ID } from "@/src/lib/db";

const NAME_KEY = "@macromax/name";

export function useAuth() {
  const [name, setNameState] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!hasLoadedRef.current) {
        setInitializing(true);
      }

      AsyncStorage.getItem(NAME_KEY)
        .then((storedName) => {
          if (active) {
            setNameState(storedName?.trim() || null);
            hasLoadedRef.current = true;
          }
        })
        .finally(() => {
          if (active) {
            setInitializing(false);
          }
        });

      return () => {
        active = false;
      };
    }, [])
  );

  async function setName(nextName: string) {
    const trimmed = nextName.trim();
    await AsyncStorage.setItem(NAME_KEY, trimmed);
    setNameState(trimmed || null);
  }

  return {
    session: name ? { user: { id: LOCAL_USER_ID } } : null,
    initializing,
    userId: name ? LOCAL_USER_ID : null,
    name,
    setName,
  };
}
