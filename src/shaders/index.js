// Сборка GLSL-программ из файлов *.glsl / *.vert / *.frag.
import marsAtmoFragGlsl from './mars-atmo.frag?raw';
import marsAtmoVertGlsl from './mars-atmo.vert?raw';
import marsCommonGlsl from './mars-common.glsl?raw';
import marsFlatVertGlsl from './mars-flat.vert?raw';
import marsFragGlsl from './mars.frag?raw';
import markersPlacesGlsl from './markers-places.glsl?raw';
import markersRoutesGlsl from './markers-routes.glsl?raw';
import marsVertGlsl from './mars.vert?raw';
import noiseGlsl from './noise.glsl?raw';
import surfaceBodyGlsl from './surface-body.glsl?raw';
import surfaceShowFragGlsl from './surface-show.frag?raw';
import surfaceVertGlsl from './surface.vert?raw';

export var NOISE_GLSL = noiseGlsl;

// ---- Шейдеры ------------------------------------------------------------
var MARS_COMMON = NOISE_GLSL + marsCommonGlsl;

export var MARS_VERT = MARS_COMMON + marsVertGlsl;

export var MARS_FRAG = markersPlacesGlsl + markersRoutesGlsl + marsFragGlsl;

export var MARS_ATMO_VERT = marsAtmoVertGlsl;
export var MARS_ATMO_FRAG = marsAtmoFragGlsl;

// ---- Вид с поверхности: трассировка рельефа, небо Марса, Солнце, звёзды ----
export var SURF_VERT = surfaceVertGlsl;
var SURF_BODY = surfaceBodyGlsl;
export var SURF_FRAG = '#define H_SMOOTH 1\n#define PREC 1\n' + MARS_COMMON + SURF_BODY;
export var SURF_SHOW_FRAG = surfaceShowFragGlsl;

export var MARS_FLAT_VERT = marsFlatVertGlsl;
