// BASE
interface BaseMath<T> {
  clone(a: T|number[]|Float32Array|Float64Array): T;
  add(out: T, a: T, b: T): T;
  createFloat64(): T;
  createNumber(): T;
  copy(out: T, a: T|number[]|Float32Array|Float64Array): T;
  equals(a: T, b: T, eps?: number): boolean;
  scale(out: T, a: T, s: number): T;
  sub(out: T, a: T, b: T): T;
  subtract(out: T, a: T, b: T): T;
}

interface BaseVector<T> extends BaseMath<T> {
  [index: number]: number;
  dot(a: T, b: T): number;
  transformMatrix44(out: T, a: T, m: Matrix44): T;
  normalize(out: T, a: T): T;
  squaredLength(a: T): number;
  scaleAndAdd(out: T, a: T, b: T, c: number): T;
  length(a: T): number;
  distance(a: T, b: T): number;
}

interface BaseMatrix<T> extends BaseMath<T>, Array<number> {
  [index: number]: number;
  copy(out: T, m: T|number[]|Float32Array|Float64Array): T;
  clone(m: T|number[]|Float32Array|Float64Array): T;
  multiply(out: T, l: T, r: T): T;
  invert(out: T, m: T): T;
}

// VECTOR

interface Vector2 extends BaseVector<Vector2> {
  asFloat64(x: number, y: number): Vector2;
  cross(out: Vector2, a: Vector2, b: Vector2): Vector2
  isParallel(a: Vector2, b: Vector2, sense?: number, tol?: number): boolean;
  set(out: Vector2, x: number, y: number): Vector2;
}

interface Vector3 extends BaseVector<Vector3> {
  asFloat64(x: number, y: number, z: number): Vector3;
  set(out: Vector3, x: number, y: number, z: number): Vector3;
  setEulerFromRotationMatrix(out: Vector3, m: Matrix44, order?: string): Vector3;
  cross(out: Vector3, a: Vector3, b: Vector3): Vector3;
  isParallel(a: Vector3, b: Vector3, sense?: number, tol?: number): boolean;
  transformAsDirectionMatrix44(out: Vector3, a: Vector3, m: Matrix44): Vector3;
  lerp(out: Vector3, a: Vector3, b: Vector3, t: number): Vector3;
}

interface Vector4 extends BaseVector<Vector4> {
  asFloat64(x: number, y: number, z: number, w: number): Vector4;
  set(out: Vector4, x: number, y: number, z: number, w: number): Vector4;
}

// MATRIX

interface Matrix44 extends BaseMatrix<Matrix44> {
  asFloat64(m00: number, m01: number, m02: number, m03: number, m10: number, m11: number, m12: number, m13: number,
    m20: number, m21: number, m22: number, m23: number, m30: number, m31: number, m32: number, m33: number): Matrix44;
  setRotationFromEuler(out: Matrix44, v: Vector3, order?: string): Matrix44;
  fromTranslation(out: Matrix44, v: Vector3): Matrix44;
  fromRotation(out: Matrix44, rad: number, axis: Vector3): Matrix44;
  getTranslation(out: Vector3, m: Matrix44): Vector3;
  extractRotation(out: Matrix44, mat: Matrix44): Matrix44;
}

interface ProjectionUtils {
    frustum(out: Matrix44, left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix44;
    perspective(out: Matrix44, fovy: number, aspect: number, near: number, far: number): Matrix44;
    ortho(out: Matrix44, left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix44;
    lookAt(out: Matrix44, eye: Vector3, center: Vector3, up: Vector3): Matrix44;
    transformProjectionMatrix(out: Vector3, a: Vector3, m: Matrix44): Vector3;
}

declare module '@adsk/lynx-math' {
  const Vector2: Vector2;
  const Vector3: Vector3;
  const Vector4: Vector4;
  const Matrix44: Matrix44;
  const DBL_EPSILON: number;
  const FLT_EPSILON: number;
  const FLOAT64_TOLERANCE: number;
  const FLOAT32_TOLERANCE: number;
  const ProjectionUtils: ProjectionUtils;
  export {
    Vector2,
    Vector3,
    Vector4,
    Matrix44,
    DBL_EPSILON,
    FLT_EPSILON,
    FLOAT64_TOLERANCE,
    FLOAT32_TOLERANCE,
    ProjectionUtils,
  };
}
