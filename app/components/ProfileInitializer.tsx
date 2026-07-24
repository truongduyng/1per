import React, { useEffect, useState } from "react";
import { profileOps, ensureDatabaseInitialized } from "@/lib/db";

interface ProfileInitializerProps {
  children: React.ReactNode;
  onInitialized?: (needsOnboarding: boolean) => void;
  onReady?: () => void;
}

export default function ProfileInitializer({
  children,
  onInitialized,
  onReady,
}: ProfileInitializerProps) {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initializeProfile = async () => {
      try {
        await ensureDatabaseInitialized();

        const existingProfile = await profileOps.getFirst();

        if (!existingProfile) {
          await profileOps.create({
            name: "User",
            avatar: "person-outline",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            createdAt: new Date(),
          });
          onInitialized?.(true);
        } else {
          onInitialized?.(!existingProfile.onboardingCompleted);
        }
      } catch (error) {
        console.error("Error with profile initialization:", error);
        onInitialized?.(false);
      }

      setIsInitializing(false);
      onReady?.();
    };

    initializeProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isInitializing) return null;

  return <>{children}</>;
}
