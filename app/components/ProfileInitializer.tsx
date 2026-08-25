import React, { useEffect, useState } from "react";
import { profileOps, ensureDatabaseInitialized } from "@/lib/db";
import { restoreCloudOnStartup, startCloudSyncListener, syncNow } from "@/lib/cloudSync";

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
    let stopCloudSync: (() => void) | null = null;

    const initializeProfile = async () => {
      let cloudSnapshotState: boolean | null = null;

      try {
        await ensureDatabaseInitialized();

        // Pull first. Starting the listener before this finishes can upload
        // the bootstrap/local DB and overwrite an existing cloud snapshot.
        cloudSnapshotState = await restoreCloudOnStartup();

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

        // A signed-in account without a cloud snapshot is a new backup. This
        // is the only startup path that is allowed to push local data.
        stopCloudSync = startCloudSyncListener();
        if (cloudSnapshotState === false) await syncNow();
      } catch (error) {
        console.error("Error with profile initialization:", error);
        onInitialized?.(false);

        // Do not start the upload listener after a failed cloud pull. Keeping
        // the local DB usable is safe; uploading it would not be.
      }

      setIsInitializing(false);
      onReady?.();
    };

    initializeProfile();
    return () => { stopCloudSync?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isInitializing) return null;

  return <>{children}</>;
}
