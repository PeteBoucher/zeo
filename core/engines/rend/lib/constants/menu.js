export const WIDTH = 1024;
export const HEIGHT = Math.round(WIDTH / 1.5);
export const ASPECT_RATIO = WIDTH / HEIGHT;
export const WORLD_WIDTH = 2;
export const WORLD_HEIGHT = WORLD_WIDTH / ASPECT_RATIO;
export const WORLD_DEPTH = WORLD_WIDTH / 50;

export const NAVBAR_WIDTH = WIDTH;
export const NAVBAR_HEIGHT = 50;
export const NAVBAR_ASPECT_RATIO = NAVBAR_WIDTH / NAVBAR_HEIGHT;
export const NAVBAR_WORLD_WIDTH = WORLD_WIDTH;
export const NAVBAR_WORLD_HEIGHT = NAVBAR_WORLD_WIDTH / NAVBAR_ASPECT_RATIO;
export const NAVBAR_WORLD_DEPTH = 0.01;

export const DEFAULT_USER_HEIGHT = 1.6;

export const TRANSITION_TIME = 1000;

export default {};
