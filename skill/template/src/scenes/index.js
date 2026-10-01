import boot from './01-boot.js';
import lyric from './02-lyric.js';
import rain from './03-log-rain.js';
import particle from './04-particle.js';
import isometric from './05-isometric.js';
import dataviz from './06-dataviz.js';

// Array order is draw order. Overlap freely; later entries paint on top.
export default [boot, lyric, rain, particle, isometric, dataviz];
