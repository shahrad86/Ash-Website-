import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main:               resolve(__dirname, 'index.html'),
        about:              resolve(__dirname, 'about.html'),
        admin:              resolve(__dirname, 'admin.html'),
        blog:               resolve(__dirname, 'blog.html'),
        buyers:             resolve(__dirname, 'buyers.html'),
        contact:            resolve(__dirname, 'contact.html'),
        'first-time-buyers':resolve(__dirname, 'first-time-buyers.html'),
        landlords:          resolve(__dirname, 'landlords.html'),
        'mls-search':       resolve(__dirname, 'mls-search.html'),
        'privacy-policy':   resolve(__dirname, 'privacy-policy.html'),
        sellers:            resolve(__dirname, 'sellers.html'),
        'comm-agincourt':   resolve(__dirname, 'communities/agincourt.html'),
        'comm-bayview':     resolve(__dirname, 'communities/bayview-village.html'),
        'comm-don-mills':   resolve(__dirname, 'communities/don-mills.html'),
        'comm-north-york':  resolve(__dirname, 'communities/north-york.html'),
        'comm-scarborough': resolve(__dirname, 'communities/scarborough.html'),
        'comm-village-green-square': resolve(__dirname, 'communities/village-green-square.html'),
        'comm-willowdale':  resolve(__dirname, 'communities/willowdale.html'),
        'comm-york-mills':  resolve(__dirname, 'communities/york-mills.html'),
        listing:            resolve(__dirname, 'listing.html'),
        search:             resolve(__dirname, 'search.html'),
      },
    },
  },
});
