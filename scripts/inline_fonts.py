#!/usr/bin/env python3
"""
Inline fontes de ícones do Expo Vector Icons como @font-face base64 no index.html.

Por quê?
  Em produção (K8s Emergent), o caminho /assets/node_modules/@expo/vector-icons/.../
  Fonts/*.ttf NÃO é servido corretamente (retorna 404 ou HTML).
  Resultado: TODOS os ícones do app renderizam como quadrados vazios (tofu).

Solução:
  Embedar as fontes diretamente no HTML como base64. O browser carrega as fontes
  da própria página, sem dependência de path/CDN/ingress rewrites.

Quais fontes são incluídas (~3MB total, apenas as efetivamente usadas no app):
  - Ionicons               (Ionicons icon family)
  - MaterialCommunityIcons (MaterialCommunityIcons family)
  - MaterialIcons          (MaterialIcons family)
  - FontAwesome            (FontAwesome family)
  - FontAwesome5_Regular   (FontAwesome5 Regular icons)
  - FontAwesome5_Solid     (FontAwesome5 Solid icons)
  - AntDesign              (AntDesign family)
  - Entypo                 (Entypo family)
  - Feather                (Feather icon family)

Como funciona:
  - Lê dist/index.html (ou static_frontend/index.html)
  - Procura .ttf files em assets/node_modules/.../Fonts/
  - Base64-encoda cada fonte
  - Injeta <style> com @font-face declarations no <head>
  - Reescreve o HTML em-place
"""
import base64
import os
import re
import sys
from pathlib import Path

# Quais famílias de fonte queremos inlinear (regex match do nome do arquivo)
FONT_FAMILIES = {
    "Ionicons":               "Ionicons",
    "MaterialCommunityIcons": "MaterialCommunityIcons",
    "MaterialIcons":          "MaterialIcons",
    "FontAwesome":            "FontAwesome",  # arquivo "FontAwesome.{hash}.ttf"
    "FontAwesome5_Regular":   "FontAwesome5_Regular",
    "FontAwesome5_Solid":     "FontAwesome5_Solid",
    "FontAwesome5_Brands":    "FontAwesome5_Brands",
    "FontAwesome6_Regular":   "FontAwesome6_Regular",
    "FontAwesome6_Solid":     "FontAwesome6_Solid",
    "FontAwesome6_Brands":    "FontAwesome6_Brands",
    "AntDesign":              "AntDesign",
    "Entypo":                 "Entypo",
    "Feather":                "Feather",
    "Foundation":             "Foundation",
    "Octicons":               "Octicons",
    "SimpleLineIcons":        "SimpleLineIcons",
    "Zocial":                 "Zocial",
    "EvilIcons":              "EvilIcons",
}


def find_font_file(fonts_dir: Path, family_filename_prefix: str) -> Path | None:
    """Find a TTF file that starts with the given prefix (then any hash + .ttf)."""
    if not fonts_dir.is_dir():
        return None
    # Match files like "Ionicons.{32hexchars}.ttf" (com underscore variants)
    # Match exactly the family prefix followed by a dot, NOT followed by extra letters.
    # E.g. "Ionicons.{hash}.ttf" matches, but "Ionicons5_Brands.{hash}.ttf" does NOT.
    pattern = re.compile(
        rf"^{re.escape(family_filename_prefix)}\.[a-z0-9]{{32}}\.ttf$"
    )
    for f in sorted(fonts_dir.glob("*.ttf")):
        if pattern.match(f.name):
            return f
    return None


def build_font_face_css(fonts_dir: Path) -> str:
    """Gera as declarações @font-face base64 para todas as famílias encontradas."""
    css_blocks = []
    found = 0
    skipped = 0
    for family_name, prefix in FONT_FAMILIES.items():
        font_path = find_font_file(fonts_dir, prefix)
        if not font_path:
            skipped += 1
            continue
        with open(font_path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        css_blocks.append(
            f"@font-face{{font-family:'{family_name}';"
            f"src:url(data:font/ttf;base64,{b64}) format('truetype');"
            f"font-weight:normal;font-style:normal;font-display:swap;}}"
        )
        found += 1
        size_kb = font_path.stat().st_size // 1024
        print(f"  ✓ {family_name:<28} {size_kb:>5}KB  ({font_path.name})")
    print(f"\nTotal: {found} fontes inlineadas, {skipped} ausentes")
    return "\n".join(css_blocks)


def inject_into_html(html_path: Path, css: str) -> None:
    """Insere o <style> com os @font-face no <head> do HTML."""
    if not html_path.is_file():
        raise FileNotFoundError(html_path)
    html = html_path.read_text(encoding="utf-8")

    # Idempotent: se já existe nossa tag, substitui o conteúdo
    style_tag = (
        '<style id="bx-inline-fonts" type="text/css">\n'
        + css
        + '\n</style>'
    )

    if 'id="bx-inline-fonts"' in html:
        new_html = re.sub(
            r'<style id="bx-inline-fonts"[^>]*>.*?</style>',
            style_tag,
            html,
            count=1,
            flags=re.DOTALL,
        )
    else:
        # Insere logo após o <head> abertura
        new_html = html.replace(
            "<head>",
            f"<head>\n{style_tag}",
            1,
        )

    html_path.write_text(new_html, encoding="utf-8")
    new_size = html_path.stat().st_size
    print(f"\nHTML atualizado: {html_path}")
    print(f"Tamanho final: {new_size:,} bytes ({new_size / 1024 / 1024:.1f} MB)")


def main() -> int:
    # Aceita o diretório como argumento, ou usa o padrão dist
    if len(sys.argv) > 1:
        base = Path(sys.argv[1])
    else:
        base = Path("/app/frontend/dist")

    if not base.is_dir():
        print(f"ERRO: diretório não existe: {base}")
        return 1

    index_html = base / "index.html"
    fonts_dir = (
        base
        / "assets"
        / "node_modules"
        / "@expo"
        / "vector-icons"
        / "build"
        / "vendor"
        / "react-native-vector-icons"
        / "Fonts"
    )

    if not fonts_dir.is_dir():
        print(f"ERRO: pasta de fontes não existe: {fonts_dir}")
        return 1

    print(f"📦 Processando {base}...")
    print(f"   index.html: {index_html} ({index_html.stat().st_size:,} bytes)")
    print(f"   fonts dir : {fonts_dir}\n")

    css = build_font_face_css(fonts_dir)
    if not css:
        print("⚠️  Nenhuma fonte encontrada — nada feito.")
        return 1

    inject_into_html(index_html, css)
    print("\n✅ Pronto! Ícones agora carregam inline, sem dependência de path.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
