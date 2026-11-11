"use client";

import type { Account, Category, Named } from "@/api/models";
import { paths } from "@/api/paths";
import { useAll } from "../hooks";
import type { Lookups } from "./logic";

/** Los catálogos que dan nombre a lo presupuestado (categorías, cuentas, centros de costo y etiquetas). */
export function useLookups(): Lookups & { loading: boolean } {
  const categories = useAll<Category>(paths.categories());
  const accounts = useAll<Account>(paths.accounts());
  const tags = useAll<Named>(paths.tags());
  const costCenters = useAll<Named>(paths.costCenters());
  return {
    categories: categories.items,
    accounts: accounts.items,
    tags: tags.items,
    costCenters: costCenters.items,
    loading: categories.loading || accounts.loading || tags.loading || costCenters.loading,
  };
}
