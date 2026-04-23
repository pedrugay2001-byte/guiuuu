import React from "react";
import { Image as ExpoImage, ImageProps as ExpoImageProps } from "expo-image";
import type { StyleProp, ImageStyle } from "react-native";

/**
 * Drop-in replacement para `<Image source={{uri}} style>` que usa expo-image
 * com cache memory+disk e placeholder sutil. Compatível com base64 data URLs.
 */
type Props = Omit<ExpoImageProps, "source" | "style"> & {
  source?: { uri?: string | null } | number | null | undefined;
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  placeholder?: string;
};

const BLUR_HASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4"; // neutro escuro

export default function CachedImage({ source, uri, style, placeholder, ...rest }: Props) {
  const src =
    uri ? { uri } :
    (source && typeof source === "object" && "uri" in source) ? source :
    source;
  return (
    <ExpoImage
      source={src as any}
      style={style as any}
      placeholder={placeholder || BLUR_HASH}
      placeholderContentFit="cover"
      cachePolicy="memory-disk"
      transition={180}
      contentFit="cover"
      {...rest}
    />
  );
}
