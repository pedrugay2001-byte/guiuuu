/**
 * Mapeamento Nicho → Subcategorias (filtros horizontais no topo do catálogo).
 * Default sempre "Todos" como primeira opção. Cada subcategoria gera um chip
 * filtrável no topo da tela /catalog/[tier].
 *
 * Listas oficiais validadas pelo usuário (BlacksClub Master).
 */
export const NICHE_SUBCATS: Record<string, { id: string; label: string }[]> = {
  performance: [
    { id: "all", label: "Todos" },
    { id: "emagrecimento", label: "Emagrecimento" },
    { id: "energia", label: "Energia" },
    { id: "foco", label: "Foco" },
    { id: "forca-massa", label: "Força e Massa" },
    { id: "recuperacao", label: "Recuperação" },
    { id: "estetica", label: "Estética" },
    { id: "longevidade", label: "Longevidade" },
  ],
  tech: [
    { id: "all", label: "Todos" },
    { id: "smartphones", label: "Smartphones" },
    { id: "informatica", label: "Informática" },
    { id: "audio", label: "Áudio" },
    { id: "smartwatch", label: "Smartwatch" },
    { id: "games", label: "Games" },
    { id: "bikes-eletricas", label: "Bikes Elétricas" },
    { id: "patinetes", label: "Patinetes" },
    { id: "iluminacao", label: "Iluminação" },
    { id: "acessorios", label: "Acessórios" },
  ],
  beleza: [
    { id: "all", label: "Todos" },
    { id: "roupas", label: "Roupas" },
    { id: "moda-fitness", label: "Moda Fitness" },
    { id: "perfumes", label: "Perfumes" },
    { id: "skincare", label: "Skincare" },
    { id: "maquiagem", label: "Maquiagem" },
    { id: "cabelos", label: "Cabelos" },
    { id: "suplementos", label: "Suplementos" },
    { id: "bem-estar", label: "Bem-estar" },
  ],
  // Semi novos e usados — somente "Todos" (sem subcategorias) por decisão do usuário.
  "semi-novos": [
    { id: "all", label: "Todos" },
  ],
  lazer: [
    { id: "all", label: "Todos" },
    { id: "camping", label: "Camping" },
    { id: "pesca", label: "Pesca" },
    { id: "trilhas", label: "Trilhas" },
    { id: "aventuras", label: "Aventuras" },
    { id: "churrasco", label: "Churrasco" },
    { id: "viagem", label: "Viagem" },
    { id: "hobby", label: "Hobby" },
    { id: "outdoor", label: "Outdoor" },
  ],
  black: [
    { id: "all", label: "Todos" },
    { id: "lancamentos", label: "Lançamentos" },
    { id: "premium", label: "Premium" },
    { id: "importados", label: "Importados" },
    { id: "edicao-limitada", label: "Edição Limitada" },
    { id: "ofertas", label: "Ofertas Exclusivas" },
  ],
};

export const NICHE_LABEL: Record<string, string> = {
  tech: "Tecnologia & Eletrônicos",
  performance: "Performance Humana",
  beleza: "Moda, Saúde & Beleza",
  "semi-novos": "Semi novos e Usados",
  lazer: "Lazer, Hobby e Camp",
  black: "Exclusivos Black",
};
