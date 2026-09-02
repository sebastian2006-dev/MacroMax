import { useCallback, useEffect, useRef, useState } from "react";
import { getProfile, updateProfileTargets } from "@/src/lib/db";
import { Profile } from "@/src/types";

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const data = await getProfile();
      hasLoadedRef.current = true;
      setProfile(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateTargets = useCallback(
    async (targets: {
      target_calories: number;
      target_protein: number;
      target_carbs: number;
      target_fats: number;
    }) => {
      if (!userId) {
        return false;
      }

      await updateProfileTargets(targets);
      await refresh();
      return true;
    },
    [userId, refresh]
  );

  return { profile, loading, refresh, updateTargets };
}
