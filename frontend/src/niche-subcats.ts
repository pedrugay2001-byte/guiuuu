/**
 * Mapeamento Nicho → Subcategorias (filtros horizontais no topo do catálogo).
 * Default sempre "Todos" como primeira opção. Cada subcategoria gera um chip
 * filtrável no topo da tela /catalog/[tier].
 */
export const NICHE_SUBCATS: Record<string, { id: string; label: string }[]> = {
  performance: [
    { id: "all", label: "Todos" },
    { id: "emagrecedores", label: "Emagrecedores" },
    { id: "energia", label: "Energia" },
    { id: "foco", label: "Foco" },
    { id: "forca-massa", label: "Força & Massa" },
    { id: "recuperacao", label: "Recuperação" },
    { id: "estetica", label: "Estética" },
    { id: "longevidade", label: "Longevidade" },
  ],
  tech: [
    { id: "all", label: "Todos" },
    { id: "smartphones", label: "Smartphones" },
    { id: "computadores", label: "Computadores" },
    { id: "audio", label: "Áudio" },
    { id: "smartwatches", label: "Smartwatches" },
    { id: "games", label: "Games" },
    { id: "ebikes", label: "E-Bikes" },
    { id: "patinetes", label: "Patinetes" },
    { id: "iluminacao", label: "Iluminação" },
    { id: "acessorios", label: "Acessórios" },
  ],
  beleza: [
    { id: "all", label: "Todos" },
    { id: "roupas", label: "Roupas" },
    { id: "fitness-fashion", label: "Fitness Fashion" },
    { id: "perfumes", label: "Perfumes" },
    { id: "skincare", label: "Skincare" },
    { id: "maquiagem", label: "Maquiagem" },
    { id: "cabelo", label: "Cabelo" },
    { id: "suplementos", label: "Suplementos" },
    { id: "bem-estar", label: "Bem-estar" },
  ],
  casa: [
    { id: "all", label: "Todos" },
    { id: "cozinha", label: "Cozinha" },
    { id: "louca", label: "Louça" },
    { id: "banho", label: "Banho" },
    { id: "cama", label: "Cama" },
    { id: "ferramentas", label: "Ferramentas" },
    { id: "torneiras", label: "Torneiras" },
    { id: "organizacao", label: "Organização" },
    { id: "decor", label: "Decor" },
  ],
  lazer: [
    { id: "all", label: "Todos" },
    { id: "camping", label: "Camping" },
    { id: "pesca", label: "Pesca" },
    { id: "trilha", label: "Trilha" },
    { id: "aventura", label: "Aventura" },
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
  casa: "Casa & Lifestyle",
  lazer: "Lazer, Hobby & Camp",
  black: "Exclusivos Black",
};
