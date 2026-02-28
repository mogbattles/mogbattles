import { createBrowserClient } from "@supabase/ssr";
import type { CategoryRow } from "./supabase";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Tree node type (category + children) ────────────────────────────────────

export interface CategoryTreeNode extends CategoryRow {
  children: CategoryTreeNode[];
}

// ─── Build a tree from a flat list of categories ─────────────────────────────

function buildTree(categories: CategoryRow[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // Create nodes
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  // Link parents → children
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sort_order
  const sortChildren = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// ─── Fetch full category tree ────────────────────────────────────────────────

export async function getCategoryTree(
  thingType?: string
): Promise<CategoryTreeNode[]> {
  const client = db();
  let query = client
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (thingType) {
    query = query.eq("thing_type", thingType);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return buildTree(data as CategoryRow[]);
}

// ─── Fetch direct children of a parent (null = root categories) ──────────────

export async function getCategoryChildren(
  parentId: string | null
): Promise<CategoryRow[]> {
  const client = db();
  let query = client
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as CategoryRow[];
}

// ─── Fetch a single category by slug ─────────────────────────────────────────

export async function getCategoryBySlug(
  slug: string
): Promise<CategoryRow | null> {
  const client = db();
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as CategoryRow;
}

// ─── Fetch a single category by ID ──────────────────────────────────────────

export async function getCategoryById(
  id: string
): Promise<CategoryRow | null> {
  const client = db();
  const { data, error } = await client
    .from("categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as CategoryRow;
}

// ─── Get ancestor chain for breadcrumbs (via RPC) ────────────────────────────

export async function getCategoryAncestors(
  categoryId: string
): Promise<{ id: string; name: string; slug: string; depth: number }[]> {
  const client = db();
  const { data, error } = await client.rpc("get_category_ancestors", {
    cat_id: categoryId,
  });
  if (error || !data) return [];
  return data as { id: string; name: string; slug: string; depth: number }[];
}

// ─── Get all descendant IDs (inclusive) via RPC ──────────────────────────────

export async function getCategoryDescendantIds(
  categoryId: string
): Promise<string[]> {
  const client = db();
  const { data, error } = await client.rpc("get_category_descendants", {
    root_id: categoryId,
  });
  if (error || !data) return [categoryId];
  return (data as { id: string }[]).map((r) => r.id);
}

// ─── Fetch all categories (flat list, for admin) ─────────────────────────────

export async function getAllCategories(): Promise<CategoryRow[]> {
  const client = db();
  const { data, error } = await client
    .from("categories")
    .select("*")
    .order("path")
    .order("sort_order");
  if (error || !data) return [];
  return data as CategoryRow[];
}

// ─── Admin: Create a category ────────────────────────────────────────────────

export async function createCategory(input: {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  parent_id?: string | null;
  thing_type?: string;
  sort_order?: number;
}): Promise<{ data: CategoryRow | null; error: string | null }> {
  const client = db();

  // Calculate depth and path from parent
  let depth = 0;
  let path = input.slug;

  if (input.parent_id) {
    const { data: parent } = await client
      .from("categories")
      .select("depth, path")
      .eq("id", input.parent_id)
      .single();
    if (parent) {
      const p = parent as { depth: number; path: string };
      depth = p.depth + 1;
      path = `${p.path}/${input.slug}`;
    }
  }

  const { data, error } = await client
    .from("categories")
    .insert({
      ...input,
      depth,
      path,
      thing_type: input.thing_type ?? "human",
    })
    .select()
    .single();

  if (error) return { data: null, error: (error as { message: string }).message };
  return { data: data as CategoryRow, error: null };
}

// ─── Admin: Update a category ────────────────────────────────────────────────

export async function updateCategory(
  id: string,
  input: {
    name?: string;
    slug?: string;
    description?: string | null;
    icon?: string | null;
    parent_id?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<{ error: string | null }> {
  const client = db();
  const { error } = await client
    .from("categories")
    .update(input)
    .eq("id", id);
  if (error) return { error: (error as { message: string }).message };
  return { error: null };
}

// ─── Admin: Delete (soft-deactivate) a category ─────────────────────────────

export async function deleteCategory(
  id: string
): Promise<{ error: string | null }> {
  const client = db();
  const { error } = await client
    .from("categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: (error as { message: string }).message };
  return { error: null };
}

// ─── Profile ↔ Category helpers ──────────────────────────────────────────────

export async function getProfileCategories(
  profileId: string
): Promise<CategoryRow[]> {
  const client = db();
  const { data, error } = await client
    .from("profile_categories")
    .select("category_id, categories(*)")
    .eq("profile_id", profileId);
  if (error || !data) return [];
  return (data as { categories: CategoryRow }[])
    .map((r) => r.categories)
    .filter(Boolean);
}

export async function setProfileCategories(
  profileId: string,
  categoryIds: string[]
): Promise<{ error: string | null }> {
  const client = db();

  // Delete existing
  const { error: delError } = await client
    .from("profile_categories")
    .delete()
    .eq("profile_id", profileId);
  if (delError) return { error: (delError as { message: string }).message };

  // Insert new
  if (categoryIds.length > 0) {
    const rows = categoryIds.map((cid) => ({
      profile_id: profileId,
      category_id: cid,
    }));
    const { error: insError } = await client
      .from("profile_categories")
      .insert(rows);
    if (insError) return { error: (insError as { message: string }).message };
  }

  return { error: null };
}
