/**
 * <AmountText/> — renderiza um valor monetário com os CENTAVOS em fonte menor.
 *
 * Uso comum:
 *   <AmountText parts={formatPYXParts(cents)} unit="PYX" />
 *   <AmountText parts={formatUSxParts(cents, rate)} />
 *
 * Estrutura visual:
 *   [prefix?] [sign]INT [,DEC (menor)] [unit?]
 *
 * Se `hidden` for true, mostra o marcador (••••) preservando prefix/unit para
 * legibilidade (ex: "USx •••••").
 *
 * Suporta children slot: `renderText` — permite envolver o texto com um wrapper
 * (ex: MetallicText do finance-hero-banner) mantendo a lógica de dividir int/dec.
 */

import React from "react";
import { View, Text, StyleSheet, StyleProp, TextStyle, ViewStyle } from "react-native";

export type AmountParts = {
  int: string;
  dec: string;
  sign?: string;
  prefix?: string;
};

type Props = {
  parts: AmountParts;
  unit?: string;                     // ex: "PYX" (aparece depois do valor)
  hidden?: boolean;                  // esconde os dígitos, mantém prefix/unit
  hiddenMarker?: string;             // default: "•••••"
  style?: StyleProp<TextStyle>;      // estilo base (aplica em int, sign, prefix, unit)
  decStyle?: StyleProp<TextStyle>;   // estilo dos decimais (sobrescreve fonte menor)
  unitStyle?: StyleProp<TextStyle>;  // estilo específico da unidade (ex: "PYX")
  prefixStyle?: StyleProp<TextStyle>;// estilo específico do prefix (ex: "USx ")
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * `decRatio` — proporção da fonte dos centavos em relação à fonte base.
   * default: 0.6 (ou seja, 60% do tamanho do inteiro).
   */
  decRatio?: number;
  /** renderiza cada bloco através de um wrapper custom (ex: MetallicText). */
  renderWrap?: (child: React.ReactNode, part: "prefix" | "int" | "dec" | "unit") => React.ReactNode;
};

export function AmountText({
  parts,
  unit,
  hidden = false,
  hiddenMarker = "•••••",
  style,
  decStyle,
  unitStyle,
  prefixStyle,
  containerStyle,
  testID,
  decRatio = 0.6,
  renderWrap,
}: Props) {
  // Extrai fontSize do style principal para calcular fonte dos decimais
  const flat = StyleSheet.flatten(style || {}) as TextStyle;
  const baseSize = typeof flat.fontSize === "number" ? flat.fontSize : 20;
  const decSize = Math.max(9, Math.round(baseSize * decRatio));

  const wrap = (node: React.ReactNode, part: "prefix" | "int" | "dec" | "unit") =>
    renderWrap ? renderWrap(node, part) : node;

  return (
    <View style={[s.row, containerStyle]} testID={testID}>
      {parts.prefix ? (
        <>
          {wrap(
            <Text style={[style, prefixStyle]} allowFontScaling={false}>
              {parts.prefix}
            </Text>,
            "prefix",
          )}
        </>
      ) : null}

      {hidden ? (
        <>
          {wrap(
            <Text style={[style]} allowFontScaling={false}>
              {hiddenMarker}
            </Text>,
            "int",
          )}
        </>
      ) : (
        <>
          {wrap(
            <Text style={[style]} allowFontScaling={false}>
              {parts.sign || ""}
              {parts.int}
            </Text>,
            "int",
          )}
          {wrap(
            <Text
              style={[
                style,
                { fontSize: decSize } as TextStyle,
                decStyle,
              ]}
              allowFontScaling={false}
            >
              ,{parts.dec}
            </Text>,
            "dec",
          )}
        </>
      )}

      {unit ? (
        <>
          {wrap(
            <Text style={[style, unitStyle]} allowFontScaling={false}>
              {" "}
              {unit}
            </Text>,
            "unit",
          )}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
});
