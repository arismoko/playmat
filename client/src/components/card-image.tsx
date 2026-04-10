import { useEffect, useState, type ReactNode } from "react";

type CardImageProps = {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
  fallback?: ReactNode;
};

export function CardImage({
  src,
  alt,
  className,
  priority = false,
  width = 488,
  height = 680,
  fallback = null,
}: CardImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return <>{fallback}</>;
  }

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      draggable={false}
      height={height}
      loading={priority ? "eager" : "lazy"}
      src={src}
      width={width}
      onError={() => setHasError(true)}
    />
  );
}
