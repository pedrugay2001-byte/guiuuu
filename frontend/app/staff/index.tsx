import { Redirect } from "expo-router";

/** /staff → redireciona automaticamente para a tela de login da equipe. */
export default function StaffIndex() {
  return <Redirect href="/staff/login" />;
}
