import { createCollectionRoutes } from "../../../../server/collectionProxy";

/**
 * /api/lists(/{id}) -> backend /api/lists(/{id})
 *
 * Opsiyonel catch-all: segmentsiz yol (koleksiyon) ile tek kayit ayni
 * dosyadan geciyor. Zorunlu catch-all ([...path]) segmentsiz yolu
 * eslestirmedigi icin liste ucu 404 olurdu.
 */

export const dynamic = "force-dynamic";

export const { GET, POST, PATCH, DELETE } = createCollectionRoutes("/lists");
