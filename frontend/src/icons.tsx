/**
 * Universal Icon Wrapper — Lucide-based replacement for @expo/vector-icons
 *
 * Por que existe?
 *   @expo/vector-icons carrega fontes TTF em runtime. Em produção (K8s Emergent)
 *   o servir das fontes falha de forma imprevisível, fazendo TODOS os ícones
 *   renderizarem como quadrados vazios.
 *
 * Solução:
 *   lucide-react-native é 100% SVG (componentes React Native). Funciona em web
 *   E native sem nenhuma dependência de fonte/CDN. Este wrapper preserva o
 *   exato mesmo API do @expo/vector-icons (<Ionicons name="..." size={n} color="..." />),
 *   permitindo migração drop-in via find/replace nos imports.
 *
 * Como usar:
 *   ANTES: import { Ionicons, MaterialCommunityIcons } from "./icons";
 *   DEPOIS: import { Ionicons, MaterialCommunityIcons } from "../src/icons";
 *
 *   Resto do código não muda:
 *   <Ionicons name="heart" size={24} color="#FF0000" />
 */
import * as React from "react";
import {
  // Layout / Navigation
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Home,
  // Status / Indicators
  CheckCircle,
  CheckCircle2,
  Check,
  CheckCheck,
  XCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  HelpCircle,
  Circle,
  // User / Social
  User,
  Users,
  UserPlus,
  UserCircle,
  ShieldCheck,
  ShieldEllipsis,
  // Commerce
  ShoppingBag,
  ShoppingCart,
  Tag,
  Tags,
  Wallet,
  Coins,
  Receipt,
  Store,
  Package,
  // Communication
  MessageCircle,
  MessagesSquare,
  MessageSquareDots,
  Send,
  Mail,
  Mic,
  Headphones,
  Megaphone,
  // Media / Visual
  Camera,
  Image as LucideImage,
  Images,
  Video,
  Share2,
  QrCode,
  Palette,
  Sparkles,
  Eye,
  EyeOff,
  // Editing / Actions
  Edit,
  Edit3,
  Trash,
  Trash2,
  Search,
  Copy,
  RefreshCw,
  StopCircle,
  Lock,
  Key,
  LogOut,
  // Content
  FileText,
  File,
  Files,
  BookOpen,
  Calendar,
  Clock,
  Hourglass,
  // Stats / Charts
  TrendingUp,
  BarChart3,
  Gauge,
  Activity,
  PieChart,
  LineChart,
  Scale,
  // Misc
  Bell,
  BellOff,
  Star,
  Trophy,
  Award,
  Medal,
  Gem,
  Infinity,
  Lightbulb,
  Compass,
  Brain,
  Target,
  Flag,
  Bot,
  Bike,
  Box,
  MoreHorizontal,
  Grid3X3,
  Zap,
  Dumbbell,
  Apple,
  FlaskConical,
  Stethoscope,
  Laptop,
  Cpu,
  // Misc additions for MCI
  HandCoins,
} from "lucide-react-native";

export interface IconProps {
  /** Ionicons / MaterialCommunityIcons name (existing API) */
  name?: string;
  /** Icon size in px (defaults to 24) */
  size?: number;
  /** Stroke / fill color */
  color?: string;
  /** Style passthrough (e.g. { marginRight: 4 }) */
  style?: any;
  /** Pass-through for any extra props (testID etc) */
  [key: string]: any;
}

// =============================================================================
// IONICONS MAP — 99 ícones únicos usados no app
// =============================================================================
// Mapeamento curado: cada Ionicons name → lucide component equivalente
// (visual mais próximo). Variantes "-outline" mapeiam para o mesmo lucide
// (o lucide já tem stroke style por padrão).
const IONICONS_MAP: Record<string, React.ComponentType<any>> = {
  // Navigation
  "chevron-forward": ChevronRight,
  "chevron-back": ChevronLeft,
  "arrow-forward": ArrowRight,
  "close": X,
  "close-circle": XCircle,
  "close-circle-outline": XCircle,
  "add": Plus,
  "add-circle": Plus,
  "add-circle-outline": Plus,
  "remove": Minus,
  "home": Home,
  "grid": Grid3X3,
  "ellipsis-horizontal": MoreHorizontal,
  // Status
  "checkmark": Check,
  "checkmark-circle": CheckCircle,
  "checkmark-done": CheckCheck,
  "checkmark-done-circle": CheckCircle2,
  "alert-circle": AlertCircle,
  "information-circle": Info,
  "information-circle-outline": Info,
  "warning": AlertTriangle,
  // User / Social
  "person": User,
  "person-add": UserPlus,
  "person-circle": UserCircle,
  "people": Users,
  "people-outline": Users,
  "shield-checkmark": ShieldCheck,
  // Commerce
  "bag-handle": ShoppingBag,
  "bag-handle-outline": ShoppingBag,
  "bag-outline": ShoppingBag,
  "cart-outline": ShoppingCart,
  "cash": Coins,
  "pricetag": Tag,
  "pricetags": Tags,
  "wallet": Wallet,
  "wallet-outline": Wallet,
  "receipt-outline": Receipt,
  "storefront": Store,
  "storefront-outline": Store,
  "cube": Box,
  "cube-outline": Package,
  // Communication
  "chatbubble": MessageCircle,
  "chatbubble-ellipses": MessageSquareDots,
  "chatbubble-ellipses-outline": MessageSquareDots,
  "chatbubbles": MessagesSquare,
  "chatbubbles-outline": MessagesSquare,
  "send": Send,
  "mail-outline": Mail,
  "mic": Mic,
  "headset": Headphones,
  "megaphone": Megaphone,
  "megaphone-outline": Megaphone,
  // Media / Visual
  "camera": Camera,
  "image": LucideImage,
  "image-outline": LucideImage,
  "images-outline": Images,
  "videocam": Video,
  "share-social": Share2,
  "share-social-outline": Share2,
  "qr-code": QrCode,
  "color-palette": Palette,
  "sparkles": Sparkles,
  // Editing / Actions
  "create": Edit,
  "create-outline": Edit3,
  "trash": Trash,
  "trash-outline": Trash2,
  "search": Search,
  "copy-outline": Copy,
  "refresh": RefreshCw,
  "stop": StopCircle,
  "lock-closed": Lock,
  "key": Key,
  "log-out-outline": LogOut,
  // Content
  "document-outline": File,
  "document-text": FileText,
  "documents-outline": Files,
  "calendar": Calendar,
  "calendar-outline": Calendar,
  "time": Clock,
  "time-outline": Clock,
  "hourglass": Hourglass,
  // Stats
  "trending-up": TrendingUp,
  "analytics": BarChart3,
  "analytics-outline": BarChart3,
  "stats-chart": LineChart,
  "speedometer-outline": Gauge,
  // Notifications
  "notifications-outline": Bell,
  "notifications-off-outline": BellOff,
  // Misc
  "star": Star,
  "trophy": Trophy,
  "ribbon": Award,
  "medal": Medal,
  "diamond": Gem,
  "diamond-outline": Gem,
  "infinite": Infinity,
  "bulb": Lightbulb,
  "bulb-outline": Lightbulb,
  "compass": Compass,
  "bicycle-outline": Bike,
  // Tech / Performance / Home — Niches screen icons
  "laptop-outline": Laptop,
  "laptop": Laptop,
  "hardware-chip-outline": Cpu,
  "hardware-chip": Cpu,
  "fitness-outline": Dumbbell,
  "fitness": Dumbbell,
  "barbell": Dumbbell,
  "barbell-outline": Dumbbell,
  "home-outline": Home,
};

// =============================================================================
// MATERIAL COMMUNITY ICONS MAP — 14 ícones únicos
// =============================================================================
const MCI_MAP: Record<string, React.ComponentType<any>> = {
  "diamond-stone": Gem,
  "brain": Brain,
  "wallet-outline": Wallet,
  "flag-outline": Flag,
  "book-open-variant": BookOpen,
  "hand-coin": HandCoins,
  "package-variant": Package,
  "robot": Bot,
  "shield-lock-outline": ShieldEllipsis,
  "check-circle": CheckCircle,
  "chart-line-variant": LineChart,
  "target": Target,
  "calendar-month": Calendar,
  "qrcode-scan": QrCode,
  "stethoscope": Stethoscope,
};

// =============================================================================
// Wrapper Component Factory
// =============================================================================
// Cria um wrapper que aceita o exato mesmo API do @expo/vector-icons:
//   <Ionicons name="heart" size={24} color="red" />
function makeIconWrapper(
  family: string,
  map: Record<string, React.ComponentType<any>>,
) {
  // eslint-disable-next-line react/display-name
  const Component = (props: IconProps) => {
    const { name, size = 24, color = "#000", style, ...rest } = props;
    const LucideIcon = name ? map[name] : null;
    if (!LucideIcon) {
      if (process.env.NODE_ENV !== "production" && name) {
        console.warn(
          `[icons] ${family}: missing mapping for "${name}". Falling back to HelpCircle. ` +
            `Add it in /app/frontend/src/icons.tsx.`,
        );
      }
      return <HelpCircle size={size} color={color} style={style} {...rest} />;
    }
    return <LucideIcon size={size} color={color} style={style} {...rest} />;
  };
  (Component as any).displayName = family;
  return Component;
}

// =============================================================================
// Exports — drop-in replacement for @expo/vector-icons
// =============================================================================
export const Ionicons = makeIconWrapper("Ionicons", IONICONS_MAP);
export const MaterialCommunityIcons = makeIconWrapper(
  "MaterialCommunityIcons",
  MCI_MAP,
);
// Tipo de glyph nome — manteve para retro-compat com TS
export type IconName = string;
