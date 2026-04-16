import { describe, it, expect, beforeEach } from "vitest";
import useAuthStore from "./authStore";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null });
});

describe("authStore", () => {
  it("inicia sem token", () => {
    const { token } = useAuthStore.getState();
    expect(token).toBeNull();
  });

  it("logout limpa token e user", () => {
    useAuthStore.setState({ token: "abc", user: { sub: 1 } });
    useAuthStore.getState().logout();
    const { token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("isAuthenticated retorna false sem token", () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
