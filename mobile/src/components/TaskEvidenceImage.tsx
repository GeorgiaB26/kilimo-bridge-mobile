import React, { useEffect, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { getCachedTaskPhotoUri } from '../services/offlineTaskPhotoCache';
import { useReadCacheUserScope } from '../hooks/useReadCacheUserScope';

type Props = Omit<ImageProps, 'source'> & {
  taskId: string;
  remoteUrl: string;
};

/** Renders a local cached evidence photo when available, otherwise the remote URL. */
export function TaskEvidenceImage({ taskId, remoteUrl, ...imageProps }: Props) {
  const userScope = useReadCacheUserScope();
  const [uri, setUri] = useState(remoteUrl);

  useEffect(() => {
    setUri(remoteUrl);
    let cancelled = false;
    void getCachedTaskPhotoUri(taskId, remoteUrl, userScope).then((resolved) => {
      if (!cancelled && resolved) setUri(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, remoteUrl, userScope]);

  return <Image source={{ uri }} {...imageProps} />;
}
