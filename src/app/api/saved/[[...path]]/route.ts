import { createCollectionRoutes } from "../../../../server/collectionProxy";

/**
 * /api/saved(/{id}) -> backend /api/saved(/{id})
 *
 * Kaydetme kota harcamiyor: backend tarafinda `validate_api_key`
 * kullaniliyor, `verify_api_key` degil. Bir yeri kaydetmek arama degil.
 */

export const dynamic = "force-dynamic";

export const { GET, POST, PATCH, DELETE } = createCollectionRoutes("/saved");
