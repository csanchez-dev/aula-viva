import { useEffect, useState } from "react";

/**
 * Router mínimo basado en el hash de la URL (#/tema/123).
 * Funciona en cualquier hosting estático sin configuración y permite usar "atrás" del navegador.
 */
export type Route =
  | { name: "home" }
  | { name: "new" }
  | { name: "topic"; id: string }
  | { name: "review"; topicId?: string }
  | { name: "quiz"; id: string }
  | { name: "activity" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [head, id] = parts;
  if (head === "nuevo") return { name: "new" };
  if (head === "actividad") return { name: "activity" };
  if (head === "tema" && id) return { name: "topic", id };
  if (head === "repaso") return { name: "review", topicId: id };
  if (head === "simulacro" && id) return { name: "quiz", id };
  return { name: "home" };
}

export function href(route: Route): string {
  switch (route.name) {
    case "new":
      return "#/nuevo";
    case "activity":
      return "#/actividad";
    case "topic":
      return `#/tema/${route.id}`;
    case "review":
      return route.topicId ? `#/repaso/${route.topicId}` : "#/repaso";
    case "quiz":
      return `#/simulacro/${route.id}`;
    default:
      return "#/";
  }
}

export const navigate = (route: Route) => {
  window.location.hash = href(route);
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
