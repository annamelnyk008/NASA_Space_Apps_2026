// Временный мост: старый код ожидает глобальный window.THREE (раньше он приходил с CDN, r128).
// Версия three закреплена в package.json (0.128.0) — та же, что стояла в index.html.
// Когда код разнесут по модулям, здесь останется только `import * as THREE from 'three'` в нужных файлах.
import * as THREE from 'three';

window.THREE = THREE;
