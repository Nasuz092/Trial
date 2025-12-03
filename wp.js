import { createHmac } from 'crypto';
import OAuth from 'oauth-1.0a';
import { env } from '$env/dynamic/private';
import { cachedFetch } from '$lib/server/cache.js';

const WORDPRESS_URL = env.WORDPRESS_URL;
const WOO_CONSUMER_KEY = env.WOO_CONSUMER_KEY;
const WOO_CONSUMER_SECRET = env.WOO_CONSUMER_SECRET;

// --- LOGGING ENVIRONMENT VARIABLES ---
console.log('[UMKM KEDIRI] --- WP API CONFIG ---');
console.log(`[UMKM KEDIRI] WORDPRESS_URL: ${WORDPRESS_URL ? 'Loaded' : 'MISSING'}`);
console.log(`[UMKM KEDIRI] WOO_CONSUMER_KEY: ${WOO_CONSUMER_KEY ? 'Loaded' : 'MISSING'}`);
console.log(`[UMKM KEDIRI] WOO_CONSUMER_SECRET: ${WOO_CONSUMER_SECRET ? 'Loaded' : 'MISSING'}`);
console.log('[UMKM KEDIRI] -----------------------');

// Validate required environment variables
if (!WORDPRESS_URL) {
	console.error('[UMKM KEDIRI] CRITICAL: WORDPRESS_URL is not set! API calls will fail.');
}
if (!WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
	console.warn(
		'[UMKM KEDIRI] WARNING: WooCommerce API credentials are missing. Some API calls may fail.'
	);
}

export async function getVendorImages(storeName, eventFetch) {
	const fetcher = eventFetch || fetch;
	if (!storeName || typeof storeName !== 'string') return [];
	if (!ensureWpUrl('getVendorImages')) return [];

	const cacheKey = `vendor_images_${storeName.toLowerCase().replace(/\s+/g, '_')}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				console.log(`[getVendorImages] Searching images for store: ${storeName}`);

				// Normalisasi nama toko (hapus spasi dan karakter khusus)
				const normalizedStoreName = storeName
					.toLowerCase()
					.replace(/[^\w\s-]/g, '')
					.replace(/[\s_-]+/g, '')
					.trim();

				console.log(`[getVendorImages] Normalized store name: ${normalizedStoreName}`);

				// Cari gambar dengan pola: namatoko1, namatoko2, namatoko3
				const searchPatterns = [
					`${normalizedStoreName}1`,
					`${normalizedStoreName}2`,
					`${normalizedStoreName}3`
				];

				const foundImages = [];

				// Cari di media WordPress - VERSI SEDERHANA
				for (const pattern of searchPatterns) {
					const res = await fetcher(
						getSignedUrl(`${WP_URL}/wp-json/wp/v2/media?search=${pattern}&per_page=5`)
					);

					if (res.ok) {
						const mediaItems = await res.json();
						
						// Filter media yang mengandung pattern
						const matchingItems = mediaItems.filter((item) => {
							const fileName = item.source_url
								? item.source_url.split('/').pop().toLowerCase().replace(/\.[^/.]+$/, '')
								: '';
							const title = (item.title?.rendered || '').toLowerCase();
							return fileName.includes(pattern.toLowerCase()) || title.includes(pattern.toLowerCase());
						});

						// Ambil informasi penting - batasi 2 gambar per pattern
						matchingItems.slice(0, 2).forEach((item) => {
							if (item.source_url) {
								foundImages.push({
									source_url: item.source_url,
									alt_text: item.alt_text || `${storeName} - Gambar`,
									title: item.title?.rendered || pattern
								});
							}
						});
					}
				}

				return foundImages;
			} catch (error) {
				console.error(`[getVendorImages] Error fetching vendor images for ${storeName}:`, error);
				return [];
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Fungsi untuk mendapatkan gambar namatoko1 - VERSI SEDERHANA
export async function getVendorStoreImage(storeName, eventFetch) {
	const fetcher = eventFetch || fetch;
	if (!storeName || typeof storeName !== 'string') return null;
	if (!ensureWpUrl('getVendorStoreImage')) return null;

	const cacheKey = `vendor_store_image_${storeName.toLowerCase().replace(/\s+/g, '_')}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				// Normalisasi nama toko
				const normalizedStoreName = storeName
					.toLowerCase()
					.replace(/[^\w\s-]/g, '')
					.replace(/[\s_-]+/g, '')
					.trim();

				// Cari gambar dengan pola: namatoko1
				const searchPattern = `${normalizedStoreName}1`;

				// Gunakan WordPress media endpoint dengan search
				const res = await fetcher(
					getSignedUrl(`${WP_URL}/wp-json/wp/v2/media?search=${searchPattern}&per_page=5`)
				);

				if (res.ok) {
					const mediaItems = await res.json();

					// Filter media yang mengandung pattern
					const matchingItem = mediaItems.find((item) => {
						const fileName = item.source_url
							? item.source_url.split('/').pop().toLowerCase().replace(/\.[^/.]+$/, '')
							: '';
						const title = (item.title?.rendered || '').toLowerCase();
						return fileName.includes(searchPattern.toLowerCase()) || title.includes(searchPattern.toLowerCase());
					});

					if (matchingItem && matchingItem.source_url) {
						return matchingItem.source_url;
					}
				}

				return null;
			} catch (error) {
				console.error('Error in getVendorStoreImage:', error);
				return null;
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Validate required environment variables
if (!WORDPRESS_URL) {
	console.error('[UMKM KEDIRI] CRITICAL: WORDPRESS_URL is not set! API calls will fail.');
}
if (!WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
	console.warn(
		'[UMKM KEDIRI] WARNING: WooCommerce API credentials are missing. Some API calls may fail.'
	);
}
// -------------------------------------

const WP_URL = WORDPRESS_URL;

const FIVE_MINUTES_IN_SECONDS = 300;
const ONE_MINUTE_IN_SECONDS = 60;
const TEN_MINUTES_IN_SECONDS = 100;
const THIRTY_MINUTES_IN_SECONDS = 300;
// const FIVE_MINUTES_IN_SECONDS = 300; // kept for reference, not currently used

const MAIN_PRODUCT_CATEGORIES = {
	fnb: { id: 16, name: 'FnB', slug: 'fnb' },
	fashion: { id: 18, name: 'Fashion', slug: 'fashion' },
	kerajinan: { id: 20, name: 'Kerajinan', slug: 'kerajinan' }
};

const oauth = OAuth({
	consumer: { key: WOO_CONSUMER_KEY, secret: WOO_CONSUMER_SECRET },
	signature_method: 'HMAC-SHA1',
	hash_function(base_string, key) {
		return createHmac('sha1', key).update(base_string).digest('base64');
	}
});

function ensureWpUrl(fnName = '') {
	if (!WP_URL) {
		return false;
	}
	return true;
}

function getSignedUrl(url, method = 'GET') {
	if (!WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
		return url; // Return unsigned URL if keys are missing
	}
	const request_data = { url, method };
	const token = oauth.authorize(request_data);
	const signedUrl = new URL(url);
	for (const [key, value] of Object.entries(token)) {
		signedUrl.searchParams.set(key, value);
	}
	return signedUrl.toString();
}

// ... (rest of the helper functions remain the same)
function generateSlugFromStoreName(storeName) {
	if (typeof storeName !== 'string' || !storeName.trim()) return 'unknown-store';
	return storeName
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function stripHtml(html) {
	if (typeof html !== 'string') return '';
	return html.replace(/<[^>]*>?/gm, '');
}

function isDefaultDokanBanner(url) {
	if (!url || typeof url !== 'string') return false;
	return url.includes('dokan-lite') && url.includes('default-store-banner');
}

function normalizeVendorData(vendor) {
	const storeName = vendor.store_name || vendor.shop_name || vendor.name || 'UMKM Tanpa Nama';
	let vendorSlug = vendor.slug || vendor.store_slug;

	if (typeof vendorSlug !== 'string' || !vendorSlug.trim()) {
		vendorSlug = generateSlugFromStoreName(storeName);
	}

	return {
		...vendor,
		slug: vendorSlug.trim(),
		store_name: storeName,
		address: vendor.address || {},
		social: vendor.social || {},
		phone: vendor.phone || '',
		email: vendor.email || '',
		dokan_biography: vendor.dokan_biography || '',
		icon: vendor.icon || vendor.gravatar || vendor.avatar || ''
	};
}

export async function getCategoryBySlug(slug) {
	return MAIN_PRODUCT_CATEGORIES[slug] || null;
}

// --- Functions using fetch need to accept eventFetch ---

export async function getDokanStoreById(storeId) {
	if (!storeId) return null;
	if (!ensureWpUrl('getDokanStoreById')) return null;
	const cacheKey = `dokan_store_final_v4_${storeId}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const storeUrl = `${WP_URL}/wp-json/dokan/v1/stores/${storeId}`;
				const userUrl = `${WP_URL}/wp-json/wp/v2/users/${storeId}?_embed`;
				const [storeRes, userRes] = await Promise.all([
					fetch(getSignedUrl(storeUrl)),
					fetch(getSignedUrl(userUrl))
				]);

				if (!storeRes.ok) return null;

				const vendorData = await storeRes.json();
				if (!vendorData || typeof vendorData !== 'object' || Array.isArray(vendorData)) {
					return null;
				}

				let normalizedVendor = normalizeVendorData(vendorData);
				if (userRes.ok) {
					const userData = await userRes.json();
					const avatarUrl = userData.avatar_urls?.['96'] || userData.simple_local_avatar?.full;
					if (avatarUrl) normalizedVendor.icon = avatarUrl;
					if (userData.description) {
						normalizedVendor.dokan_biography = stripHtml(userData.description);
					}
				}
				return normalizedVendor;
			} catch (error) {
				return null;
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

export async function getDokanStoreBySlug(slug, eventFetch) {
	const fetcher = eventFetch || fetch;
	if (!slug) return null;
	if (!ensureWpUrl('getDokanStoreBySlug')) return null;
	const cacheKey = `dokan_store_by_slug_v1_${slug}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const url = `${WP_URL}/wp-json/dokan/v1/stores?per_page=50`;
				const res = await fetcher(getSignedUrl(url));
				if (!res.ok) return null;

				const stores = await res.json();
				if (!Array.isArray(stores) || stores.length === 0) return null;

				// Find store by multiple criteria
				let store = stores.find((s) => {
					if (!s) return false;
					// Check exact slug match
					if (s.slug === slug) return true;
					// Check generated slug from store name
					const storeName = s.store_name || s.shop_name || s.name;
					if (storeName && generateSlugFromStoreName(storeName) === slug) return true;
					// Check if slug is in the store name (case insensitive)
					if (storeName && storeName.toLowerCase().includes(slug.replace(/-/g, ' '))) return true;
					return false;
				});

				if (!store) return null;

				let normalizedVendor = normalizeVendorData(store);
				const userUrl = `${WP_URL}/wp-json/wp/v2/users/${store.id}?_embed`;
				const userRes = await fetcher(getSignedUrl(userUrl));
				if (userRes.ok) {
					const userData = await userRes.json();
					const avatarUrl = userData.avatar_urls?.['96'] || userData.simple_local_avatar?.full;
					if (avatarUrl) normalizedVendor.icon = avatarUrl;
					if (userData.description) {
						normalizedVendor.dokan_biography = stripHtml(userData.description);
					}
				}

				return normalizedVendor;
			} catch (error) {
				return null;
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

// Optimized: Fetch single blog post with Yoast SEO
export async function getWordpressPost(slug, eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `wp_post_${slug}`;

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const queryParams = new URLSearchParams({ slug });
				if (!ensureWpUrl('getWordpressPost')) return null;
				const url = `${WP_URL}/wp-json/wp/v2/posts?${queryParams.toString()}`;
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 7000);
				const res = await fetcher(url, {
					signal: controller.signal,
					headers: { Accept: 'application/json', 'Cache-Control': 'no-transform' }
				});
				clearTimeout(timeout);
				if (!res.ok) return null;
				const posts = await res.json();
				if (!posts.length) return null;
				const post = posts[0];

				// Try to fetch featured media separately if featured_media ID is available
				let featuredMedia = null;
				if (post.featured_media) {
					try {
						const mediaUrl = `${WP_URL}/wp-json/wp/v2/media/${post.featured_media}`;
						const mediaRes = await fetcher(mediaUrl, {
							headers: { Accept: 'application/json' }
						});
						if (mediaRes.ok) {
							featuredMedia = await mediaRes.json();
						}
					} catch (mediaError) {
						// Silent fail for media
					}
				}

				return {
					id: post.id,
					title: { rendered: post.title?.rendered || post.title },
					content: { rendered: post.content?.rendered || post.content },
					excerpt: { rendered: post.excerpt?.rendered || post.excerpt },
					date: post.date,
					modified: post.modified || post.date,
					slug: post.slug,
					categories: post.categories,
					tags: post.tags,
					_embedded: {
						'wp:featuredmedia': featuredMedia ? [featuredMedia] : [],
						author: post._embedded?.author || [],
						'wp:term': post._embedded?.['wp:term'] || []
					},
					featured_media: post.featured_media,
					yoast_head_json: post.yoast_head_json || null
				};
			} catch (error) {
				return null;
			}
		},
		ONE_MINUTE_IN_SECONDS
	);
}

// Optimized: Fetch blog posts for listing (minimal fields)
export async function getWordpressPosts(params = {}, eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `wp_posts_final_v3_${JSON.stringify(params)}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const queryParams = new URLSearchParams({
					per_page: params.per_page || 10,
					orderby: 'date',
					order: 'desc',
					...params
				});

				if (!ensureWpUrl('getWordpressPosts')) return { posts: [], totalPages: 0, total: 0 };
				const url = `${WP_URL}/wp-json/wp/v2/posts?${queryParams.toString()}`;
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 30000);
				const res = await fetcher(url, {
					signal: controller.signal,
					headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }
				});
				clearTimeout(timeout);
				if (!res.ok) return { posts: [], totalPages: 0, total: 0 };
				const posts = await res.json();
				const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
				const total = parseInt(res.headers.get('X-WP-Total') || '0');

				// Fetch featured media for posts that have featured_media
				const postsWithMedia = await Promise.all(
					posts.map(async (post) => {
						let featuredMedia = null;
						if (post.featured_media) {
							try {
								const mediaUrl = `${WP_URL}/wp-json/wp/v2/media/${post.featured_media}`;
								const mediaRes = await fetcher(mediaUrl, {
									headers: { Accept: 'application/json' }
								});
								if (mediaRes.ok) {
									featuredMedia = await mediaRes.json();
								}
							} catch (mediaError) {
								// Silent fail for media
							}
						}
						return {
							...post,
							_embedded: {
								'wp:featuredmedia': featuredMedia ? [featuredMedia] : [],
								author: post._embedded?.author || [],
								'wp:term': post._embedded?.['wp:term'] || []
							}
						};
					})
				);

				return { posts: postsWithMedia, totalPages, total };
			} catch (error) {
				return { posts: [], totalPages: 0, total: 0 };
			}
		},
		ONE_MINUTE_IN_SECONDS
	);
}

// Optimized: Fetch products for listing/flipbook (minimal fields, include categories for relation)
async function getProductsByCategory(
	categoryId,
	params = {},
	wooPerPage = 15,
	wooPage = 1,
	eventFetch
) {
	const fetcher = eventFetch || fetch;

	const allParams = {
		category: categoryId,
		status: 'publish',
		_fields: 'id,name,price,price_html,images,short_description,description,store,categories',
		per_page: wooPerPage,
		page: wooPage,
		...params
	};
	const cacheKey = `products_by_category_paginated_v6_${JSON.stringify(allParams)}`;

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const queryParams = new URLSearchParams(allParams);
				if (!ensureWpUrl('getProductsByCategory')) return [];
				const url = `${WP_URL}/wp-json/wc/v2/products?${queryParams}`;
				const signedUrl = getSignedUrl(url);

				const res = await fetcher(signedUrl);
				if (!res.ok) return [];

				const products = await res.json();
				return products;
			} catch (error) {
				return [];
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

export async function getVendorForDetailPage(categorySlug, vendorSlug, eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `vendor_detail_v2_${categorySlug}_${vendorSlug}`;

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const category = await getCategoryBySlug(categorySlug);
				if (!category) {
					return { vendor: null, category: null, products: [] };
				}

				// Try to find vendor globally first (more reliable)
				let vendor = await getDokanStoreBySlug(vendorSlug, fetcher);

				if (!vendor) {
					// Fallback: try find vendor within the category
					const vendorsData = await getVendorsForCategoryPage(categorySlug, 1, 50, fetcher);
					vendor = vendorsData.vendors.find(
						(v) => v && (v.slug === vendorSlug || String(v.id) === String(vendorSlug))
					);
				}

				if (!vendor) {
					return { vendor: null, category, products: [] };
				}

				// Fetch vendor's products with complete data, narrowed to this category when possible
				const products = await getDokanProducts(
					vendor.id,
					{
						_embed: true,
						per_page: 50,
						status: 'publish',
						category: category.id
					},
					fetcher
				);

				// Ensure required fields and enforce category filter as a safeguard
				const enrichedProducts = (products || [])
					.filter((product) => {
						if (!Array.isArray(product?.categories)) return true;
						return product.categories.some((c) => Number(c.id) === Number(category.id));
					})
					.map((product) => ({
						...product,
						images: product.images || [],
						price_html: product.price_html || '',
						short_description: product.short_description || '',
						description: product.description || '',
						name: product.name || 'Unnamed Product'
					}));

				return {
					vendor,
					category,
					products: enrichedProducts
				};
			} catch (error) {
				return { vendor: null, category: null, products: [] };
			}
		},
		THIRTY_MINUTES_IN_SECONDS
	);
}

export async function getVendorsForCategoryPage(
	categorySlug,
	page = 1,
	vendorsPerPage = 6,
	eventFetch
) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `vendors_for_category_page_v9_${categorySlug}_${page}_${vendorsPerPage}`;
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const category = await getCategoryBySlug(categorySlug);
				if (!category) {
					return { vendors: [], category: null, totalVendors: 0, totalPages: 0 };
				}

				let allVendorIds = new Set();
				let productsPage = 1;
				const productsPerPageForDiscovery = 50; // Reduced from 100

				// Loop to find enough unique vendors
				while (true) {
					const products = await getProductsByCategory(
						category.id,
						{},
						productsPerPageForDiscovery,
						productsPage,
						fetcher
					);
					if (!products || products.length === 0) {
						break; // No more products to discover vendors from
					}

					products.forEach((product) => {
						if (product.store?.id) {
							allVendorIds.add(product.store.id);
						}
					});

					// If we have found enough unique vendors, or if there are no more products, stop
					if (
						allVendorIds.size >= page * vendorsPerPage ||
						products.length < productsPerPageForDiscovery
					) {
						break;
					}
					productsPage++;
				}

				const sortedVendorIds = Array.from(allVendorIds).sort(); // Sort for consistent pagination
				const totalVendors = sortedVendorIds.length;
				const totalPages = Math.ceil(totalVendors / vendorsPerPage);

				const startIndex = (page - 1) * vendorsPerPage;
				const endIndex = startIndex + vendorsPerPage;
				const vendorIdsForCurrentPage = sortedVendorIds.slice(startIndex, endIndex);

				const vendorPromises = vendorIdsForCurrentPage.map((id) => getDokanStoreById(id, fetcher));
				const vendorsWithDetails = await Promise.all(vendorPromises);

				const finalVendors = vendorsWithDetails
					.filter((vendor) => vendor && typeof vendor.slug === 'string' && vendor.slug.length > 0)
					.map((vendor) => ({
						...vendor,
						categorySlug: category.slug
					}));

				return { vendors: finalVendors, category, totalVendors, totalPages };
			} catch (error) {
				return { vendors: [], category: null, totalVendors: 0, totalPages: 0 };
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

export async function getPostCategories(eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = 'wp_post_categories_v1';
	console.log(`[getPostCategories] Starting to fetch post categories`);
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				if (!ensureWpUrl('getPostCategories')) return [];
				const url = `${WP_URL}/wp-json/wp/v2/categories?per_page=100`;
				console.log(`[getPostCategories] Requesting: ${url}`);
				const res = await fetcher(url);
				if (!res.ok) {
					console.error(`Failed to fetch post categories: ${res.statusText}`);
					return [];
				}
				const categories = await res.json();
				console.log(`[getPostCategories] Found ${categories.length} categories`);
				return categories.map((cat) => ({ id: cat.id, name: cat.name, slug: cat.slug }));
			} catch (error) {
				console.error(
					'Error fetching post categories:',
					error instanceof Error ? error.message : error
				);
				return [];
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

export async function getPostCategoryBySlug(slug, eventFetch) {
	const fetcher = eventFetch || fetch;
	const categories = await getPostCategories(fetcher);
	return categories.find((cat) => cat.slug === slug) || null;
}

export async function getDokanProducts(vendorId, params = {}, eventFetch) {
	const fetcher = eventFetch || fetch;
	if (!vendorId) return [];
	if (!ensureWpUrl('getDokanProducts')) return [];
	const cacheKey = `dokan_products_final_v9_${vendorId}_${JSON.stringify(params)}`;
	console.log(`[getDokanProducts] Starting for vendor ID: ${vendorId}, params:`, params);
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				// Optimasi: Hanya ambil field yang diperlukan
				const queryParams = new URLSearchParams({
					per_page: 100,
					fields:
						'id,name,price,price_html,images,short_description,description,categories,featured,average_rating,on_sale,regular_price,sale_price,store',
					_embed: true,
					...params
				});
				const url = `${WP_URL}/wp-json/dokan/v1/stores/${vendorId}/products?${queryParams}`;
				const signedUrl = getSignedUrl(url);
				console.log(`[getDokanProducts] Requesting: ${signedUrl}`);
				const res = await fetcher(signedUrl);
				if (!res.ok) {
					console.error(`[getDokanProducts] Failed to fetch products: ${res.statusText}`);
					return [];
				}

				const products = await res.json();
				if (!Array.isArray(products)) return [];

				return products.map((product) => ({
					...product,
					description: stripHtml(product.description),
					short_description: stripHtml(product.short_description),
					price_html: stripHtml(product.price_html)
				}));
			} catch (error) {
				return [];
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

// Note: getHomepageData is defined later in this file (returns mapped blogPosts and featuredProducts)

export async function getHomepageFeaturedProducts(eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = 'homepage_featured_products_v21_unique_global';
	return cachedFetch(
		cacheKey,
		async () => {
			try {
				const finalProducts = [];
				const usedVendorIds = new Set();
				const categories = Object.values(MAIN_PRODUCT_CATEGORIES);

				for (const category of categories) {
					if (finalProducts.length >= 9) break;

					// Fetch products directly from WooCommerce API for this category
					const productsRes = await fetcher(
						getSignedUrl(
							`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&per_page=10&status=publish`
						)
					);

					if (!productsRes.ok) continue;

					const potentialProducts = await productsRes.json();

					const uniqueVendorProducts = [];
					const vendorIdsPerCategory = new Set();

					for (const product of potentialProducts) {
						const vid = product.store?.id;
						if (!vid) continue;
						if (vendorIdsPerCategory.has(vid)) continue;
						if (usedVendorIds.has(vid)) continue;

						vendorIdsPerCategory.add(vid);
						usedVendorIds.add(vid);
						uniqueVendorProducts.push({ ...product, mainCategory: category });

						if (uniqueVendorProducts.length >= 3) break;
						if (finalProducts.length + uniqueVendorProducts.length >= 9) break;
					}

					finalProducts.push(...uniqueVendorProducts);
				}

				const limitedProducts = finalProducts.slice(0, 9);

				const vendorIdsToFetch = [
					...new Set(limitedProducts.map((p) => p.store?.id).filter(Boolean))
				];
				const vendorsData = await Promise.all(
					vendorIdsToFetch.map((id) => getDokanStoreById(id, fetcher))
				);
				const vendorMap = new Map(vendorsData.filter(Boolean).map((vendor) => [vendor.id, vendor]));

				const enrichedProducts = limitedProducts.map((product) => {
					const categorySlug = product.mainCategory?.slug;
					if (!product.store?.id || !categorySlug) {
						return { ...product, vendorDetailUrl: '' };
					}
					const fullStoreData = vendorMap.get(product.store.id);
					const vendorSlug = fullStoreData?.slug;
					if (vendorSlug) {
						const vendorDetailUrl = `/products/${categorySlug}/${vendorSlug}`;
						return { ...product, store: fullStoreData, vendorDetailUrl };
					}
					return { ...product, store: fullStoreData || null, vendorDetailUrl: '' };
				});

				return enrichedProducts;
			} catch (error) {
				return [];
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

export function mapProductForFrontend(product) {
	return {
		id: product.id,
		name: product.name,
		price: product.price,
		images:
			product.images?.map((img) => ({
				id: img.id,
				src: img.src,
				alt: img.alt,
				name: img.name,
				position: img.position
			})) || [],
		categories:
			product.categories?.map((cat) => ({
				id: cat.id,
				name: cat.name,
				slug: cat.slug
			})) || [],
		short_description: product.short_description || '',
		description: product.description || '',
		mainCategory: product.mainCategory || null,
		vendorDetailUrl: product.vendorDetailUrl || '',
		price_html: product.price_html || '',
		store: product.store
			? {
					id: product.store.id,
					store_name: product.store.store_name,
					social: product.store.social,
					phone: product.store.phone,
					address: product.store.address,
					gravatar: product.store.gravatar,
					slug: product.store.slug,
					dokan_biography: product.store.dokan_biography,
					icon: product.store.icon,
					email: product.store.email,
					shop_url: product.store.shop_url
				}
			: null
	};
}

// Search products by name or store name
export async function searchProducts(searchQuery, page = 1, eventFetch, perPage = 6) {
	const fetcher = eventFetch || fetch;

	if (!searchQuery || searchQuery.trim().length < 2) {
		return { products: [], total: 0, totalPages: 0, currentPage: 1 };
	}

	if (!ensureWpUrl('searchProducts')) {
		return { products: [], total: 0, totalPages: 0, currentPage: 1 };
	}

	const cacheKey = `search_products_${searchQuery.toLowerCase().trim()}_${page}_${perPage}`;

	const searchResults = await cachedFetch(
		cacheKey,
		async () => {
			try {
				const searchTerm = searchQuery.toLowerCase().trim();

				// LANGSUNG GUNAKAN SEARCH API - lebih cepat dan efisien
				const searchUrl = `${WP_URL}/wp-json/wc/v3/products?search=${encodeURIComponent(searchTerm)}&per_page=50&status=publish`;
				
				const response = await fetcher(getSignedUrl(searchUrl));
				
				if (!response.ok) {
					return { products: [], total: 0, totalPages: 0, currentPage: 1 };
				}
				
				const products = await response.json();

				// Filter produk yang valid (punya kategori yang bukan uncategorized)
				const validProducts = products.filter(product => {
					if (!product || !product.name) return false;
					
					// Pastikan produk memiliki kategori yang valid
					const hasValidCategory = product.categories && 
						product.categories.length > 0 && 
						!product.categories.some(cat => 
							cat.slug === 'uncategorized' || 
							(cat.name && cat.name.toLowerCase().includes('uncategorized'))
						);
					
					return hasValidCategory;
				});

				// Enrich produk dengan detail vendor - lebih sederhana
				const enrichedProducts = await Promise.all(
					validProducts.slice(0, 30).map(async (product) => {
						try {
							const categorySlug = product.categories?.[0]?.slug;
							let vendorDetailUrl = '';
							let storeData = product.store; // Gunakan data yang sudah ada dulu

							// Hanya fetch detail vendor jika benar-benar diperlukan
							if (product.store?.id && categorySlug) {
								const vendorData = await getDokanStoreById(product.store.id, fetcher);
								if (vendorData && vendorData.slug) {
									storeData = vendorData;
									vendorDetailUrl = `/products/${categorySlug}/${vendorData.slug}`;
								}
							}

							return {
								...product,
								store: storeData,
								vendorDetailUrl
							};
						} catch (error) {
							return {
								...product,
								vendorDetailUrl: ''
							};
						}
					})
				);

				// Filter berdasarkan kecocokan nama produk - SEDERHANA
				const relevantProducts = enrichedProducts.filter((product) => {
					// Yang penting nama produknya mengandung query
					return product.name && product.name.toLowerCase().includes(searchTerm);
				});

				// Sortir sederhana - yang mengandung query di awal nama duluan
				const sortedProducts = relevantProducts.sort((a, b) => {
					const aStartsWith = a.name && a.name.toLowerCase().startsWith(searchTerm);
					const bStartsWith = b.name && b.name.toLowerCase().startsWith(searchTerm);
					
					if (aStartsWith && !bStartsWith) return -1;
					if (!aStartsWith && bStartsWith) return 1;
					return 0;
				});

				// Pagination
				const total = sortedProducts.length;
				const totalPages = Math.ceil(total / perPage);
				const startIndex = (page - 1) * perPage;
				const endIndex = startIndex + perPage;
				const paginatedProducts = sortedProducts.slice(startIndex, endIndex);

				return {
					products: paginatedProducts,
					total: total,
					totalPages: totalPages,
					currentPage: page,
					perPage: perPage
				};
			} catch (error) {
				return { products: [], total: 0, totalPages: 0, currentPage: 1 };
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);

	return searchResults;
}

// Fungsi untuk mendapatkan saran pencarian - VERSI SEDERHANA
export async function getSearchSuggestions(searchTerm, eventFetch) {
	const fetcher = eventFetch || fetch;

	if (!searchTerm || searchTerm.trim().length < 2) {
		return [];
	}

	const cleanSearchTerm = searchTerm.toLowerCase().trim();

	return await cachedFetch(
		`suggestions_${cleanSearchTerm}`,
		async () => {
			try {
				if (!ensureWpUrl('getSearchSuggestions')) {
					return [];
				}

				// Cari produk berdasarkan nama
				const productRes = await fetcher(
					getSignedUrl(
						`${WP_URL}/wp-json/wc/v3/products?search=${encodeURIComponent(cleanSearchTerm)}&per_page=8&status=publish`
					)
				);

				if (!productRes.ok) {
					return [];
				}

				const products = await productRes.json();
				const suggestions = [];

				// Filter produk yang valid dan ambil yang sesuai
				products
					.filter(product => {
						if (!product.name) return false;
						// Cek apakah nama produk mengandung kata pencarian
						return product.name.toLowerCase().includes(cleanSearchTerm);
					})
					.slice(0, 6)
					.forEach(product => {
						suggestions.push({
							type: 'product',
							name: product.name,
							id: product.id,
							image: product.images?.[0]?.src || '/placeholder-product.jpg'
						});
					});

				return suggestions;
			} catch (error) {
				return [];
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Fungsi untuk search results - VERSI SEDERHANA
export async function getVendorsForCategoryPageSearch(categorySlug, eventFetch) {
	const fetcher = eventFetch || fetch;

	if (!ensureWpUrl('getVendorsForCategoryPageSearch')) {
		return { vendors: [], category: null };
	}

	const cacheKey = `vendors_category_${categorySlug}`;
	
	return await cachedFetch(
		cacheKey,
		async () => {
			try {
				// Get category info
				const categoryRes = await fetch(
					getSignedUrl(`${WP_URL}/wp-json/wc/v3/products/categories?slug=${categorySlug}`)
				);

				if (!categoryRes.ok) {
					return { vendors: [], category: null };
				}

				const categories = await categoryRes.json();
				if (!categories || categories.length === 0) {
					return { vendors: [], category: null };
				}

				const category = categories[0];

				// Get products in this category
				const productsRes = await fetch(
					getSignedUrl(
						`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&per_page=50&status=publish`
					)
				);

				if (!productsRes.ok) {
					return { vendors: [], category };
				}

				const products = await productsRes.json();

				// Extract unique vendor IDs from products
				const vendorIds = [
					...new Set(products.map((product) => product.store?.id).filter((id) => id))
				];

				// Get vendor details
				const vendors = [];
				for (const vendorId of vendorIds.slice(0, 10)) { // Batasi maksimal 10 vendor
					const vendorRes = await fetcher(
						getSignedUrl(`${WP_URL}/wp-json/dokan/v1/stores/${vendorId}`)
					);
					if (vendorRes.ok) {
						const vendor = await vendorRes.json();
						const storeName = vendor.store_name || vendor.name || 'UMKM Tanpa Nama';
						
						vendors.push({
							...vendor,
							store_name: storeName,
							slug: vendor.slug || generateSlugFromStoreName(storeName),
							gravatar: vendor.gravatar || vendor.icon || vendor.avatar || '',
							storeImage: await getVendorStoreImage(storeName, fetcher),
							categorySlug: category.slug,
							categoryName: category.name
						});
					}
				}

				return { vendors, category };
			} catch (error) {
				console.error('Error in getVendorsForCategoryPageSearch:', error);
				return { vendors: [], category: null };
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Fungsi untuk mendapatkan media dari WordPress berdasarkan nama file atau title
export async function getWordpressMediaByTitle(title, eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `wp_media_by_title_${title}`;
	console.log(`[getWordpressMediaByTitle] Starting search for media with title: ${title}`);

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				if (!ensureWpUrl('getWordpressMediaByTitle')) return null;

				// Cari media berdasarkan title
				const queryParams = new URLSearchParams({
					search: title,
					per_page: 10,
					orderby: 'title',
					order: 'asc'
				});

				const url = `${WP_URL}/wp-json/wp/v2/media?${queryParams}`;
				console.log(`[getWordpressMediaByTitle] Requesting: ${url}`);

				const res = await fetcher(getSignedUrl(url));
				console.log(`[getWordpressMediaByTitle] Response status: ${res.status}`);
				if (!res.ok) {
					console.error(`[getWordpressMediaByTitle] HTTP error! status: ${res.status}`);
					return null;
				}

				const media = await res.json();
				if (!Array.isArray(media) || media.length === 0) {
					return null;
				}

				// Cari media yang paling cocok berdasarkan title atau filename
				const matchedMedia = media.find((item) => {
					const itemTitle = (item.title?.rendered || '').toLowerCase();
					const itemFilename = (item.source_url || '').split('/').pop().toLowerCase();
					const searchTitle = title.toLowerCase();

					return itemTitle.includes(searchTitle) || itemFilename.includes(searchTitle);
				});

				if (matchedMedia) {
					return {
						id: matchedMedia.id,
						title: matchedMedia.title?.rendered || '',
						source_url: matchedMedia.source_url,
						alt_text: matchedMedia.alt_text || '',
						caption: matchedMedia.caption?.rendered || '',
						description: matchedMedia.description?.rendered || ''
					};
				}

				return null;
			} catch (error) {
				return null;
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Fungsi untuk mendapatkan gambar vendor berdasarkan nama toko (format: namaToko1, namaToko2)
export async function getVendorImagesExtra1(storeName, eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = `vendor_images_${storeName}`;

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				// Bersihkan nama toko untuk pencarian - versi tanpa spasi
				const cleanStoreNameNoSpace = storeName
					.toLowerCase()
					.replace(/[^a-zA-Z0-9\s]/g, '')
					.replace(/\s+/g, '')
					.trim();

				// Bersihkan nama toko untuk pencarian - versi dengan spasi
				const cleanStoreNameWithSpace = storeName
					.toLowerCase()
					.replace(/[^a-zA-Z0-9\s]/g, '')
					.replace(/\s+/g, ' ')
					.trim();

				const images = [];

				// Coba berbagai variasi pencarian
				const searchVariations = [
					`${cleanStoreNameNoSpace}1`,
					`${cleanStoreNameNoSpace}2`,
					`${cleanStoreNameWithSpace}1`,
					`${cleanStoreNameWithSpace}2`,
					cleanStoreNameNoSpace,
					cleanStoreNameWithSpace
				];

				// Hapus duplikat dari variasi pencarian
				const uniqueVariations = [...new Set(searchVariations)];

				// Cari gambar dengan berbagai variasi
				for (const variation of uniqueVariations) {
					const media = await getWordpressMediaByTitle(variation, fetcher);
					if (media) {
						// Cek apakah gambar ini sudah ada di array untuk menghindari duplikat
						if (!images.some((img) => img.source_url === media.source_url)) {
							images.push(media);

							// Batasi hingga 2 gambar
							if (images.length >= 2) {
								break;
							}
						}
					}
				}

				return images;
			} catch (error) {
				return [];
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);
}

// Fungsi untuk mencari produk berdasarkan kategori dan query
export async function searchProductsByCategory(
	categorySlug,
	searchQuery,
	page = 1,
	eventFetch,
	perPage = 6
) {
	const fetcher = eventFetch || fetch;

	if (!ensureWpUrl('searchProductsByCategory')) {
		return { products: [], total: 0, totalPages: 0, currentPage: 1, perPage };
	}

	const cacheKey = `search_category_${categorySlug}_${searchQuery}_${page}_${perPage}`;
	const searchResults = await cachedFetch(
		cacheKey,
		async () => {
			try {
				// Get category info
				const categoryRes = await fetch(
					getSignedUrl(`${WP_URL}/wp-json/wc/v3/products/categories?slug=${categorySlug}`)
				);
				if (!categoryRes.ok) {
					return { products: [], total: 0, totalPages: 0, currentPage: 1, perPage };
				}

				const categories = await categoryRes.json();
				if (!categories || categories.length === 0) {
					return { products: [], total: 0, totalPages: 0, currentPage: 1, perPage };
				}

				const category = categories[0];

				// Array untuk menyimpan semua produk yang ditemukan
				let allProducts = [];

				// 1. Cari produk berdasarkan nama produk
				const productsByNameRes = await fetcher(
					getSignedUrl(
						`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&search=${encodeURIComponent(searchQuery)}&per_page=50&status=publish`
					)
				);

				if (productsByNameRes.ok) {
					const productsByName = await productsByNameRes.json();
					allProducts = [...productsByName];
				}

				// 2. Cari produk berdasarkan nama toko
				// Pertama, dapatkan semua toko yang namanya mengandung query
				const storesRes = await fetcher(
					getSignedUrl(
						`${WP_URL}/wp-json/dokan/v1/stores?search=${encodeURIComponent(searchQuery)}&per_page=50`
					)
				);

				if (storesRes.ok) {
					const stores = await storesRes.json();

					// Untuk setiap toko yang ditemukan, cari produknya dalam kategori ini
					for (const store of stores) {
						const storeProductsRes = await fetcher(
							getSignedUrl(
								`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&vendor=${store.id}&per_page=100&status=publish`
							)
						);

						if (storeProductsRes.ok) {
							const storeProducts = await storeProductsRes.json();
							console.log(
								`[searchProductsByCategory] Found ${storeProducts.length} products from store`
							);
							// Tambahkan produk yang belum ada di allProducts
							storeProducts.forEach((storeProduct) => {
								if (!allProducts.some((p) => p.id === storeProduct.id)) {
									allProducts.push(storeProduct);
								}
							});
						}
					}
				}

				// Enrich products with vendor details - PASTIKAN DATA VENDOR LENGKAP
				const enrichedProducts = await Promise.all(
					allProducts.map(async (product) => {
						try {
							let vendorData = null;

							// Jika product.store.id tersedia, ambil data vendor
							if (product.store?.id) {
								vendorData = await getDokanStoreByIdSearch(product.store.id, fetch);
							}

							// Siapkan data store yang lengkap
							const storeData = vendorData || product.store || {};

							// Pastikan store_name tersedia
							if (!storeData.store_name && storeData.name) {
								storeData.store_name = storeData.name;
							}

							// Pastikan slug tersedia
							if (!storeData.slug && storeData.id) {
								const storeName = storeData.store_name || storeData.name || 'UMKM Tanpa Nama';
								storeData.slug = generateSlugFromStoreName(storeName);
							}

							// Pastikan gambar produk memiliki struktur yang benar
							let productImages = product.images || [];
							if (!Array.isArray(productImages)) {
								productImages = [productImages].filter(Boolean);
							}

							// Jika tidak ada gambar, gunakan placeholder
							if (productImages.length === 0) {
								productImages = [
									{
										src: '/placeholder-product.jpg',
										alt: product.name || 'Produk'
									}
								];
							}

							return {
								...product,
								images: productImages,
								store: storeData,
								vendorDetailUrl: storeData.slug ? `/products/${categorySlug}/${storeData.slug}` : ''
							};
						} catch (error) {
							// Pastikan product.store minimal memiliki struktur dasar
							const fallbackStore = product.store || {};
							if (!fallbackStore.store_name && fallbackStore.name) {
								fallbackStore.store_name = fallbackStore.name;
							}
							if (!fallbackStore.slug && fallbackStore.id) {
								fallbackStore.slug = `toko-${fallbackStore.id}`;
							}

							// Pastikan gambar produk memiliki struktur yang benar
							let productImages = product.images || [];
							if (!Array.isArray(productImages)) {
								productImages = [productImages].filter(Boolean);
							}

							// Jika tidak ada gambar, gunakan placeholder
							if (productImages.length === 0) {
								productImages = [
									{
										src: '/placeholder-product.jpg',
										alt: product.name || 'Produk'
									}
								];
							}

							return {
								...product,
								images: productImages,
								store: fallbackStore,
								vendorDetailUrl: fallbackStore.slug
									? `/products/${categorySlug}/${fallbackStore.slug}`
									: ''
							};
						}
					})
				);

				// Pagination
				const total = enrichedProducts.length;
				const totalPages = Math.ceil(total / perPage);
				const startIndex = (page - 1) * perPage;
				const endIndex = startIndex + perPage;
				const paginatedProducts = enrichedProducts.slice(startIndex, endIndex);

				return {
					products: paginatedProducts,
					total: total,
					totalPages: totalPages,
					currentPage: page,
					perPage: perPage
				};
			} catch (error) {
				return { products: [], total: 0, totalPages: 0, currentPage: 1, perPage };
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);

	return searchResults || { products: [], total: 0, totalPages: 0, currentPage: 1, perPage };
}

// Fungsi untuk mendapatkan data toko Dokan berdasarkan ID - untuk search results
export async function getDokanStoreByIdSearch(storeId) {
	if (!storeId || !ensureWpUrl('getDokanStoreByIdSearch')) {
		return null;
	}

	const cacheKey = `store_search_${storeId}`;
	const storeData = await cachedFetch(
		cacheKey,
		async () => {
			try {
			const storeRes = await fetch(getSignedUrl(`${WP_URL}/wp-json/dokan/v1/stores/${storeId}`));

			if (!storeRes.ok) {
				return null;
			}

			const store = await storeRes.json();

			// Pastikan data toko memiliki struktur yang benar
			return {
				id: store.id,
				name: store.name || store.store_name,
				slug: store.slug,
				gravatar: store.gravatar || store.icon || '',
				store_name: store.store_name || store.name,
				...store
			};
		} catch (error) {
			return null;
		}
		},
		FIVE_MINUTES_IN_SECONDS
	);

	return storeData;
}

// Fungsi untuk mencari toko berdasarkan kategori dan query
export async function searchStoresByCategory(
	categorySlug,
	searchQuery,
	page = 1,
	eventFetch,
	perPage = 6
) {
	const fetcher = eventFetch || fetch;

	if (!ensureWpUrl('searchStoresByCategory')) {
		return { stores: [], total: 0, totalPages: 0, currentPage: 1, perPage };
	}

	const cacheKey = `search_stores_category_${categorySlug}_${searchQuery}_${page}_${perPage}`;
	const searchResults = await cachedFetch(
		cacheKey,
		async () => {
			try {
				console.log(
					`[searchStoresByCategory] Searching for stores: ${searchQuery} in category: ${categorySlug}`
				);

				// Get category info
				const categoryRes = await fetch(
					getSignedUrl(`${WP_URL}/wp-json/wc/v3/products/categories?slug=${categorySlug}`)
				);
				if (!categoryRes.ok) {
					console.error('[searchStoresByCategory] Failed to fetch category');
					return { stores: [], total: 0, totalPages: 0, currentPage: 1, perPage };
				}

				const categories = await categoryRes.json();
				if (!categories || categories.length === 0) {
					console.error('[searchStoresByCategory] Category not found');
					return { stores: [], total: 0, totalPages: 0, currentPage: 1, perPage };
				}

				const category = categories[0];
				console.log(`[searchStoresByCategory] Found category: ${category.name}`);

				// Array untuk menyimpan semua toko yang ditemukan
				let allStores = [];

				// 1. Cari toko berdasarkan nama toko
				const storesByNameRes = await fetcher(
					getSignedUrl(
						`${WP_URL}/wp-json/dokan/v1/stores?search=${encodeURIComponent(searchQuery)}&per_page=50`
					)
				);

				if (storesByNameRes.ok) {
					const storesByName = await storesByNameRes.json();
					allStores = [...storesByName];
				}

				// 2. Cari toko berdasarkan nama produk
				// Pertama, dapatkan semua produk yang namanya mengandung query dalam kategori ini
				const productsRes = await fetcher(
					getSignedUrl(
						`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&search=${encodeURIComponent(searchQuery)}&per_page=50&status=publish`
					)
				);

				if (productsRes.ok) {
					const products = await productsRes.json();

					// Ekstrak vendor IDs unik dari produk
					const vendorIds = [
						...new Set(products.map((product) => product.store?.id).filter((id) => id))
					];

					// Dapatkan detail toko untuk setiap vendor ID
					for (const vendorId of vendorIds) {
						const vendorRes = await fetcher(
							getSignedUrl(`${WP_URL}/wp-json/dokan/v1/stores/${vendorId}`)
						);
						if (vendorRes.ok) {
							const vendor = await vendorRes.json();
							// Tambahkan toko yang belum ada di allStores
							if (!allStores.some((s) => s.id === vendor.id)) {
								allStores.push(vendor);
							}
						}
					}
				}

				// Enrich stores with proper data structure
				const enrichedStores = allStores.map((store) => {
					// Pastikan data toko memiliki struktur yang lengkap
					return {
						...store,
						store_name: store.store_name || store.name,
						slug:
							store.slug ||
							generateSlugFromStoreName(store.store_name || store.name || 'UMKM Tanpa Nama'),
						gravatar: store.gravatar || store.icon || store.avatar || '',
						icon:
							store.icon ||
							store.gravatar ||
							(store.banner && !isDefaultDokanBanner(store.banner) ? store.banner : null) ||
							'https://via.placeholder.com/600x600.png?text=UMKM',
						categorySlug: category.slug,
						categoryName: category.name
					};
				});

				// Pagination
				const total = enrichedStores.length;
				const totalPages = Math.ceil(total / perPage);
				const startIndex = (page - 1) * perPage;
				const endIndex = startIndex + perPage;
				const paginatedStores = enrichedStores.slice(startIndex, endIndex);

				return {
					stores: paginatedStores,
					total: total,
					totalPages: totalPages,
					currentPage: page,
					perPage: perPage
				};
			} catch (error) {
				return { stores: [], total: 0, totalPages: 0, currentPage: 1, perPage };
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);

	return searchResults || { stores: [], total: 0, totalPages: 0, currentPage: 1, perPage };
}

// Fungsi untuk mendapatkan produk berdasarkan kategori - untuk search results
export async function getProductsByCategorySearch(
	categorySlug,
	page = 1,
	eventFetch,
	perPage = 24
) {
	console.log(`[UMKM KEDIRI] getProductsByCategorySearch called with:`, {
		categorySlug,
		page,
		perPage,
		timestamp: new Date().toISOString()
	});

	if (!ensureWpUrl('getProductsByCategorySearch')) {
		console.error('[UMKM KEDIRI] WordPress URL not configured properly');
		return { products: [], category: null, total: 0, totalPages: 0, currentPage: 1, perPage };
	}

	const cacheKey = `products_category_search_${categorySlug}_${page}_${perPage}`;
	console.log(`[UMKM KEDIRI] Using cache key: ${cacheKey}`);

	const results = await cachedFetch(
		cacheKey,
		async () => {
			try {
				console.log(`[UMKM KEDIRI] Loading products for category: ${categorySlug}, page: ${page}`);

				// Get category info
				const categoryRes = await fetch(
					getSignedUrl(`${WP_URL}/wp-json/wc/v3/products/categories?slug=${categorySlug}`)
				);

				if (!categoryRes.ok) {
					console.error(`[UMKM KEDIRI] Failed to fetch category: ${categorySlug}`, {
						status: categoryRes.status,
						statusText: categoryRes.statusText,
						url: categoryRes.url
					});
					return {
						products: [],
						category: null,
						total: 0,
						totalPages: 0,
						currentPage: page,
						perPage
					};
				}

				const categories = await categoryRes.json();
				if (!categories || categories.length === 0) {
					console.error('[getProductsByCategorySearch] Category not found');
					return {
						products: [],
						category: null,
						total: 0,
						totalPages: 0,
						currentPage: page,
						perPage
					};
				}

				const category = categories[0];

				// Get products in this category with pagination
				const productsRes = await fetch(
					getSignedUrl(
						`${WP_URL}/wp-json/wc/v3/products?category=${category.id}&per_page=${perPage}&page=${page}&status=publish`
					)
				);

				if (!productsRes.ok) {
					console.error('[getProductsByCategorySearch] Failed to fetch products');
					return { products: [], category, total: 0, totalPages: 0, currentPage: page, perPage };
				}

				const products = await productsRes.json();
				const totalPages = parseInt(productsRes.headers.get('X-WP-TotalPages') || '1');
				const total = parseInt(productsRes.headers.get('X-WP-Total') || '0');

				// Filter valid products
				const validProducts = products.filter((product) => {
					const hasValidCategory =
						product.categories &&
						product.categories.length > 0 &&
						!product.categories.some(
							(cat) =>
								cat.slug === 'uncategorized' ||
								(cat.name && cat.name.toLowerCase().includes('uncategorized'))
						);
					return hasValidCategory;
				});

				// Enrich products with vendor details
				const enrichedProducts = await Promise.all(
					validProducts.map(async (product) => {
						try {
							let vendorData = null;

							// Jika product.store.id tersedia, ambil data vendor
							if (product.store?.id) {
								vendorData = await getDokanStoreByIdSearch(product.store.id);
							}

							// Siapkan data store yang lengkap
							const storeData = vendorData || product.store || {};

							// Pastikan store_name tersedia
							if (!storeData.store_name && storeData.name) {
								storeData.store_name = storeData.name;
							}

							// Pastikan slug tersedia
							if (!storeData.slug && storeData.id) {
								const storeName = storeData.store_name || storeData.name || 'UMKM Tanpa Nama';
								storeData.slug = generateSlugFromStoreName(storeName);
							}

							// Pastikan gambar produk memiliki struktur yang benar
							let productImages = product.images || [];
							if (!Array.isArray(productImages)) {
								productImages = [productImages].filter(Boolean);
							}

							// Jika tidak ada gambar, gunakan placeholder
							if (productImages.length === 0) {
								productImages = [
									{
										src: '/placeholder-product.jpg',
										alt: product.name || 'Produk'
									}
								];
							}

							return {
								...product,
								images: productImages,
								store: storeData,
								vendorDetailUrl: storeData.slug ? `/products/${categorySlug}/${storeData.slug}` : ''
							};
						} catch (error) {
							console.error(
								`[getProductsByCategorySearch] Error enriching product ${product.id}:`,
								error
							);

							// Fallback untuk error
							const fallbackStore = product.store || {};
							if (!fallbackStore.store_name && fallbackStore.name) {
								fallbackStore.store_name = fallbackStore.name;
							}
							if (!fallbackStore.slug && fallbackStore.id) {
								const storeName =
									fallbackStore.store_name || fallbackStore.name || 'UMKM Tanpa Nama';
								fallbackStore.slug = generateSlugFromStoreName(storeName);
							}

							return {
								...product,
								images: product.images || [
									{
										src: '/placeholder-product.jpg',
										alt: product.name || 'Produk'
									}
								],
								store: fallbackStore,
								vendorDetailUrl: fallbackStore.slug
									? `/products/${categorySlug}/${fallbackStore.slug}`
									: ''
							};
						}
					})
				);

				console.log(
					`[UMKM KEDIRI] Found ${enrichedProducts.length} products for category ${categorySlug}`
				);

				const result = {
					products: enrichedProducts.map(mapProductForFrontend),
					category: {
						id: category.id,
						name: category.name,
						slug: category.slug,
						imageUrl: category.image?.src || '/placeholder-category.jpg'
					},
					total,
					totalPages,
					currentPage: page,
					perPage
				};

				console.log(`[UMKM KEDIRI] Success response for category ${categorySlug}:`, {
					productCount: result.products.length,
					total,
					totalPages,
					categoryName: result.category.name
				});

				return result;
			} catch (error) {
				console.error('[UMKM KEDIRI] getProductsByCategorySearch Error:', {
					message: error.message,
					stack: error.stack,
					categorySlug,
					page,
					perPage,
					timestamp: new Date().toISOString()
				});
				return {
					products: [],
					category: null,
					total: 0,
					totalPages: 0,
					currentPage: page,
					perPage
				};
			}
		},
		FIVE_MINUTES_IN_SECONDS
	);

	return (
		results || { products: [], category: null, total: 0, totalPages: 0, currentPage: page, perPage }
	);
}

/**
 * Mencari gambar vendor dari WordPress media berdasarkan nama toko
 * Format nama file: "namatoko1", "namatoko2" (tanpa spasi, maksimal 2 gambar)
 * @param {string} storeName - Nama toko dari vendor
 * @returns {Promise<Array>} Array objek gambar yang ditemukan
 */
export async function getVendorImagesExtra2(storeName) {
	if (!storeName || typeof storeName !== 'string') {
		console.log('[getVendorImages] Nama toko tidak valid:', storeName);
		return [];
	}

	try {
		// Normalisasi nama toko (hapus spasi dan ubah ke huruf kecil)
		const normalizedName = storeName.toLowerCase().replace(/\s+/g, '');
		console.log(`[getVendorImages] Mencari gambar untuk toko: ${storeName} -> ${normalizedName}`);

		if (!ensureWpUrl('getVendorImages')) return [];

		const fetcher = fetch;
		const foundImages = [];

		// Cari maksimal 2 gambar (format: namatoko1, namatoko2)
		for (let i = 1; i <= 2; i++) {
			const searchPattern = `${normalizedName}${i}`;
			console.log(`[getVendorImages] Mencari pattern: ${searchPattern}`);

			try {
				// Cari di media WordPress berdasarkan nama file atau judul
				const searchUrl = getSignedUrl(
					`${WP_URL}/wp-json/wp/v2/media?search=${encodeURIComponent(searchPattern)}&per_page=1`
				);

				const response = await fetcher(searchUrl);
				if (!response.ok) {
					console.log(`[getVendorImages] Tidak ada hasil untuk ${searchPattern}`);
					continue;
				}

				const mediaItems = await response.json();
				if (mediaItems && mediaItems.length > 0) {
					// Cek apakah nama file atau judul mengandung pattern yang kita cari
					const matchedMedia = mediaItems.find((media) => {
						const fileName = media.source_url
							? media.source_url.split('/').pop().split('.')[0].toLowerCase()
							: '';
						const title = media.title?.rendered
							? media.title.rendered.toLowerCase().replace(/\s+/g, '')
							: '';

						return fileName.includes(searchPattern) || title.includes(searchPattern);
					});

					if (matchedMedia) {
						foundImages.push({
							id: matchedMedia.id,
							source_url: matchedMedia.source_url,
							title: matchedMedia.title?.rendered || searchPattern,
							alt_text: matchedMedia.alt_text || `Gambar ${i} ${storeName}`
						});
						console.log(`[getVendorImages] Gambar ${i} ditemukan: ${matchedMedia.source_url}`);
					}
				}
			} catch (error) {
				console.error(`[getVendorImages] Error mencari gambar ${i}:`, error.message);
			}
		}

		console.log(`[getVendorImages] Total gambar ditemukan: ${foundImages.length}`);
		return foundImages;
	} catch (error) {
		console.error('[getVendorImages] Error:', error.message);
		return [];
	}
}

/**
 * Maps WordPress post data to frontend-friendly format
 * @param {Object} post - Raw WordPress post data
 * @returns {Object} Mapped post data for frontend
 */
export function mapBlogPostForFrontend(post) {
	if (!post) {
		console.log('[mapBlogPostForFrontend] No post data provided');
		return null;
	}

	// Extract featured image from multiple possible sources
	let featuredImage = '';

	// Priority 1: Check if already mapped
	if (post.featuredImage) {
		featuredImage = post.featuredImage;
		console.log('[mapBlogPostForFrontend] Using pre-mapped featured image:', featuredImage);
	}
	// Priority 2: Check embedded featured media (most common)
	else if (post._embedded?.['wp:featuredmedia']?.[0]) {
		const media = post._embedded['wp:featuredmedia'][0];

		// Try different size options
		featuredImage =
			media.source_url ||
			media.media_details?.sizes?.full?.source_url ||
			media.media_details?.sizes?.large?.source_url ||
			media.media_details?.sizes?.medium_large?.source_url ||
			media.media_details?.sizes?.medium?.source_url ||
			'';

		console.log('[mapBlogPostForFrontend] Extracted featured image from _embedded:', featuredImage);
	}
	// Priority 3: Check Yoast data
	else if (post.yoast_head_json?.og_image?.[0]?.url) {
		featuredImage = post.yoast_head_json.og_image[0].url;
		console.log('[mapBlogPostForFrontend] Using Yoast OG image:', featuredImage);
	}

	if (!featuredImage) {
		console.warn('[mapBlogPostForFrontend] No featured image found for post:', post.id, post.slug);
	}

	// Extract categories from embedded terms
	const categories = post._embedded?.['wp:term']?.[0] || post.categories || [];
	const category = categories[0] || null;

	// Extract author from embedded author data
	const authorData = post._embedded?.author?.[0];
	const author = authorData?.name || post.author || 'Admin';

	// Extract Yoast SEO data if available
	const yoast = post.yoast_head_json || post.yoast || {};

	// Extract and clean content
	const content = unescapeHtml(post.content?.rendered || post.content || '');
	const excerpt = unescapeHtml(post.excerpt?.rendered || post.excerpt || '');

	const mappedPost = {
		id: post.id,
		slug: post.slug,
		title: unescapeHtml(post.title?.rendered || post.title || ''),
		content,
		excerpt,
		date: post.date,
		modified: post.modified || post.date,
		featuredImage, // This is the key field
		author,
		category: category
			? {
					id: category.id,
					name: category.name,
					slug: category.slug
				}
			: null,
		categories,
		tags: post._embedded?.['wp:term']?.[1] || post.tags || [],
		yoast,
		_embedded: post._embedded // Keep embedded data for additional processing
	};

	console.log('[mapBlogPostForFrontend] Final mapped post:', {
		id: mappedPost.id,
		slug: mappedPost.slug,
		hasFeaturedImage: !!mappedPost.featuredImage,
		featuredImage: mappedPost.featuredImage
	});

	return mappedPost;
}

/**
 * Get homepage data including latest blog posts
 * @param {Function} eventFetch - Fetch function from event
 * @returns {Promise<Object>} Homepage data
 */
export async function getHomepageData(eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = 'homepage_data';
	const CACHE_TTL = FIVE_MINUTES_IN_SECONDS;

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				console.log('[getHomepageData] Loading homepage data...');

				// Fetch latest blog posts
				const latestPostsData = await getWordpressPosts({ page: 1, per_page: 3 }, fetcher);

				console.log('[getHomepageData] Latest posts loaded:', latestPostsData.posts?.length || 0);

				// Map posts using mapBlogPostForFrontend for consistency
				const mappedPosts =
					latestPostsData.posts?.map((post) => mapBlogPostForFrontend(post)) || [];

				console.log(
					'[getHomepageData] Mapped posts:',
					mappedPosts.map((p) => ({
						id: p.id,
						slug: p.slug,
						title: p.title,
						hasFeaturedImage: !!p.featuredImage,
						featuredImage: p.featuredImage
					}))
				);

				// Fetch featured products - get some products from different categories
				const featuredProducts = [];
				try {
					// Get products from multiple categories to showcase variety
					const categories = await getProductCategories(fetcher);
					const selectedCategories = categories.slice(0, 3); // Take first 3 categories

					for (const category of selectedCategories) {
						try {
							const categoryData = await getProductsByCategorySearch(category.slug, 1, fetcher, 2);

							if (categoryData && categoryData.products && categoryData.products.length > 0) {
								// Products already have vendorDetailUrl from getProductsByCategorySearch
								featuredProducts.push(...categoryData.products.slice(0, 2));
							}
						} catch (categoryError) {
							console.error(
								`[getHomepageData] Error loading products for category ${category.slug}:`,
								categoryError.message
							);
						}

						// Limit to 6 products total
						if (featuredProducts.length >= 6) break;
					}

					console.log('[getHomepageData] Featured products loaded:', featuredProducts.length);
				} catch (productError) {
					console.error('[getHomepageData] Error loading featured products:', productError.message);
				}

				return {
					latestPostsData: {
						posts: mappedPosts,
						total: latestPostsData.total || 0,
						totalPages: latestPostsData.totalPages || 0
					},
					// Add other homepage data as needed
					featuredProducts: featuredProducts.slice(0, 6), // Limit to 6 products
					vendors: [],
					categories: []
				};
			} catch (error) {
				console.error('[getHomepageData] Error loading homepage data:', error.message);
				return {
					latestPostsData: { posts: [], total: 0, totalPages: 0 },
					featuredProducts: [],
					vendors: [],
					categories: []
				};
			}
		},
		CACHE_TTL
	);
}

// Helper function (keep this in wp.js if not already there)
function unescapeHtml(text) {
	if (typeof text !== 'string') return '';
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'");
}

/**
 * Get all active vendors from Dokan API - VERSI SEDERHANA
 * @param {Function} eventFetch - Fetch function from event
 * @returns {Promise<Array>} Array of active vendors with category information
 */
export async function getAllActiveVendors(eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = 'all_active_vendors';

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				if (!ensureWpUrl('getAllActiveVendors')) {
					return [];
				}

				// Get all stores from Dokan API
				const storesRes = await fetcher(
					getSignedUrl(`${WP_URL}/wp-json/dokan/v1/stores?per_page=50`)
				);

				if (!storesRes.ok) {
					return [];
				}

				const stores = await storesRes.json();
				if (!Array.isArray(stores) || stores.length === 0) {
					return [];
				}

				// Filter active vendors and enrich with category information
				const activeVendors = [];

				for (const store of stores.slice(0, 30)) { // Batasi maksimal 30 vendor
					if (!store || !store.id) continue;

					// Check if vendor is active
					const isActive =
						store.enabled !== false &&
						store.status !== 'inactive' &&
						store.status !== 'disabled' &&
						store.is_active !== false;

					if (!isActive) continue;

					// Normalize vendor data
					const normalizedVendor = normalizeVendorData(store);

					// Map vendor to category based on store name
					const storeName = (store.store_name || store.name || '').toLowerCase();
					
					if (storeName.includes('makanan') || storeName.includes('minuman') || storeName.includes('kuliner')) {
						normalizedVendor.categorySlug = 'kuliner';
						normalizedVendor.categoryName = 'Kuliner';
					} else if (storeName.includes('kerajinan') || storeName.includes('handmade') || storeName.includes('craft')) {
						normalizedVendor.categorySlug = 'kerajinan';
						normalizedVendor.categoryName = 'Kerajinan';
					} else {
						normalizedVendor.categorySlug = 'fashion';
						normalizedVendor.categoryName = 'Fashion';
					}

					activeVendors.push(normalizedVendor);
				}

				return activeVendors;
			} catch (error) {
				console.error('Error in getAllActiveVendors:', error);
				return [];
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}

/**
 * Get product categories from WooCommerce - VERSI SEDERHANA
 * @param {Function} eventFetch - Fetch function from event
 * @returns {Promise<Array>} Array of product categories
 */
export async function getProductCategories(eventFetch) {
	const fetcher = eventFetch || fetch;
	const cacheKey = 'product_categories';

	return cachedFetch(
		cacheKey,
		async () => {
			try {
				if (!ensureWpUrl('getProductCategories')) {
					return [];
				}

				const res = await fetcher(
					getSignedUrl(`${WP_URL}/wp-json/wc/v2/products/categories?per_page=10&hide_empty=true`)
				);

				if (!res.ok) {
					return [];
				}

				return await res.json();
			} catch (error) {
				console.error('Error in getProductCategories:', error);
				return [];
			}
		},
		TEN_MINUTES_IN_SECONDS
	);
}