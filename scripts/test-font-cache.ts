import { join } from "node:path";

process.env.NIMG_CACHE_DIR = join(
	import.meta.dir,
	"../test/fixtures/font-cache",
);
