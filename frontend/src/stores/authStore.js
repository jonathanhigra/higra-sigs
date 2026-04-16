import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

const useAuthStore = create((set, get) => ({
  token: localStorage.getItem("token"),
  user: null,
  tipoUsuario: localStorage.getItem("sigs_tipo_usuario") || "I",
  permissoes: JSON.parse(localStorage.getItem("sigs_permissoes") || "{}"),
  filial: JSON.parse(localStorage.getItem("sigs_filial") || "null"),
  scope: JSON.parse(localStorage.getItem("sigs_scope") || "null"),
  hiddenModules: JSON.parse(localStorage.getItem("hidden_modules") || "[]"),

  setToken: (token) => {
    if (token) {
      localStorage.setItem("token", token);
      try {
        const decoded = jwtDecode(token);
        set({ token, user: decoded });
      } catch {
        set({ token, user: null });
      }
    } else {
      localStorage.removeItem("token");
      set({ token: null, user: null });
    }
  },

  setSigsData: (tipoUsuario, permissoes, filialData, scopeData) => {
    localStorage.setItem("sigs_tipo_usuario", tipoUsuario || "I");
    localStorage.setItem("sigs_permissoes", JSON.stringify(permissoes || {}));
    if (filialData) {
      localStorage.setItem("sigs_filial", JSON.stringify(filialData));
    }
    if (scopeData) {
      localStorage.setItem("sigs_scope", JSON.stringify(scopeData));
    }
    set({
      tipoUsuario: tipoUsuario || "I",
      permissoes: permissoes || {},
      filial: filialData || null,
      scope: scopeData || null,
    });
  },

  toggleHiddenModule: (key) => {
    const { hiddenModules } = get();
    const updated = hiddenModules.includes(key)
      ? hiddenModules.filter((k) => k !== key)
      : [...hiddenModules, key];
    localStorage.setItem("hidden_modules", JSON.stringify(updated));
    set({ hiddenModules: updated });
  },

  isModuleHidden: (key) => {
    return get().hiddenModules.includes(key);
  },

  hasPermission: (modKey) => {
    const { tipoUsuario, permissoes } = get();
    if (tipoUsuario === "A") return true;
    return !!permissoes[modKey];
  },

  canWrite: (modKey) => {
    const { tipoUsuario, permissoes } = get();
    if (tipoUsuario === "A") return true;
    return permissoes[modKey] === "M";
  },

  isAdmin: () => {
    const { tipoUsuario } = get();
    return tipoUsuario === "A" || tipoUsuario === "D";
  },

  isBypass: () => {
    const { scope } = get();
    return scope?.bypass === true;
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("sigs_tipo_usuario");
    localStorage.removeItem("sigs_permissoes");
    localStorage.removeItem("sigs_filial");
    localStorage.removeItem("sigs_scope");
    set({ token: null, user: null, tipoUsuario: "I", permissoes: {}, filial: null, scope: null });
  },

  isAuthenticated: () => {
    const { token } = get();
    if (!token) return false;
    try {
      const decoded = jwtDecode(token);
      return decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },
}));

export default useAuthStore;
