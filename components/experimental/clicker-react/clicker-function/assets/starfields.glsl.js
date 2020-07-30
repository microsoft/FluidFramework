---
name: RGB Shift Field
type: fragment
author: dpkaminski
---

precision highp float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

//modified version of https://www.shadertoy.com/view/4ljXDt

float Cell(vec2 c) {
    vec2 uv = fract(c);c -= uv;
    return (1.-length(uv*2.-1.)) * step(fract(sin(c.x+c.y*1e2)*1e3), .04);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 p = fragCoord.xy / iResolution.xy -.5;
    float a = fract(atan(p.x, p.y) / 6.2832);
    float d = length(p);
    float z = iTime / 1.5;
    vec3 col;
    
    for(int i=0; i<3 ;i++)
    {
        z += 0.02;
        vec2 coord = vec2(pow(d, .04), a)*256.;
        vec2 delta = vec2(1. + z*20., 1.);
        float c = Cell(coord-=delta);
        c += Cell(coord-=delta);
        col[i]=c*d*3.;
    }    
    
    fragColor = vec4(col,1);
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Layer Starfield
type: fragment
author: iridule
---

precision highp float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

/*
    Improved Layer Starfield
    Credits:    https://www.shadertoy.com/view/4djSRW
                https://www.shadertoy.com/view/lscczl
*/
#define R iResolution.xy
#define T iTime

mat2 rotate(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, s, -s, c);
}

// one dimensional | 1 in 1 out
float hash11(float p) {
    p = fract(p * 35.35);
    p += dot(p, p + 45.85);
    return fract(p * 7858.58);
}

// two dimensional | 2 in 1 out
float hash21(vec2 p) {
    p = fract(p * vec2(451.45, 231.95));
    p += dot(p, p + 78.78);
    return fract(p.x * p.y);
}

// two dimensional | 2 in 2 out
vec2 hash22(vec2 p) {
    vec3 q = fract(p.xyx * vec3(451.45, 231.95, 7878.5));
    q += dot(q, q + 78.78);
    return fract(q.xz * q.y);
}

float layer(vec2 uv) {

    float c = 0.;

    uv *= 5.;
    
    // id and coordinates per cell
    // f -> [-1, 1] to allow more size and glow variations
    // tf: stop the neighbour cells "cutting off" star glow
    vec2 i = floor(uv);
    vec2 f = 2. * fract(uv) - 1.; 
        
    // random position for the star in the cell
    vec2 p = .3 * hash22(i); 
    float d = length(f - p);
    
    // create fuzzier stars with random radius
    // col * (1. / d) -> glow
    c += smoothstep(.1 + .8 * hash21(i), .01, d);
    c *= (1. / d) * .2;

    return c;
}

vec3 render(vec2 uv) {

    vec3 col = vec3(0.);
    
    // rotate the whole scene
    uv *= rotate(T * .1);
    
    // oscillation to add more variations
    uv += 2. * vec2(cos(T * .001), sin(T * .001));
    
    // num layers - increase for more stars
    // adjust based on your machine
    const float num = 20.;
    const float inc = 1. / num;
    
    for (float i = 0.; i < 1.; i += inc) {
    
        // random rotate - stop repeating stars in consequent layers
        uv *= rotate(hash11(i) * 6.28);
        
        // i mapped to t -> [0, 1]
        float t = fract(i - T * .05);
        
        // smoothstep is useful for scaling and fading
        float s = smoothstep(.001, .95, t); // z-position of layer
        float f = smoothstep(0., 1., t); // fade per layer
        f *= smoothstep(1., 0., t);
        
        // random offset per layer - gives each layer the
        // appearance of drifiting
        vec2 k = .1 * hash22(vec2(i, i * 5.));
        float l = layer((uv - k) * s);
        
        // mix bg and fg colors
        col += mix(vec3(.03, .01, .04), vec3(.9, .4, 0.), l) * f;

    }
    
    // optional - just some subtle noise on top
    col += .02 * hash21(uv + T * .001);
    return col;

}

void mainImage(out vec4 O, in vec2 I) {
    vec2 uv = (2. * I - R) / R.y;
    vec3 color = render(uv);
    O = vec4(color, 1.);
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Star Dots
type: fragment
author: patu
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

// speed
#define t (iTime * .6) 

// PI value
#define PI 3.14159265

// random
#define H(P) fract(sin(dot(P,vec2(127.1,311.7)))*43758.545)

// rotate 
#define pR(a) mat2(cos(a),sin(a),-sin(a),cos(a))

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  
    vec2 uv = (fragCoord - .5 * iResolution.xy - .5) / iResolution.y;

    uv *= 2.4; // FOV
    
    // camera
    vec3 
        vuv = vec3(sin(iTime * .3), 1., cos(iTime)), // up
        ro = vec3(0., 0., 134.), // pos
        vrp = vec3(5., sin(iTime) * 60., 20.); // look at
    
    vrp.xz * pR(iTime);
    vrp.yz * pR(iTime * .2);
    
    vec3
        vpn = normalize(vrp - ro),
        u = normalize(cross(vuv, vpn)),
        rd = normalize(
            vpn + uv.x * u  + uv.y * cross(vpn, u)
        ); // ray direction
    
    vec3 sceneColor = vec3(0.0, 0., 0.3); // background color
    
    vec3 flareCol = vec3(0.); // flare color accumulator   
    float flareIntensivity = 0.; // flare intensity accumulator

    for (float k = 0.; k < 200.; k++) {
        float r = H(vec2(k)) * 2. - 1.; // random

        // 3d flare position, xyz
        vec3 flarePos =  vec3(
            H(vec2(k) * r) * 20. - 10.,
            r * 8.,
            (mod(sin(k / 200. * PI * 4.) * 15. - t * 13. * k * .007, 25.))
        );
        
        float v = max(0., abs(dot(normalize(flarePos), rd)));
        
        // main dot
        flareIntensivity += pow(v, 30000.) * 4.;
        
        // dot glow
        flareIntensivity += pow(v, 1e2) * .15; 
        
        // fade far
        flareIntensivity *= 1.- flarePos.z / 25.; 
        
        // accumulate
        flareCol += vec3(flareIntensivity) * (vec3(sin(r * 3.12 - k), r, cos(k) * 2.)) * .3; 
    }
    
    sceneColor += abs(flareCol);
    
    // go grayscale from screen center
    sceneColor = mix(sceneColor, sceneColor.rrr * 1.4, length(uv) / 2.);
    
    // adjust contrast
    fragColor.rgb = pow(sceneColor, vec3(1.1));
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Retro Starfield
type: fragment
author: gigatron
---

precision highp float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

float rand (in vec2 uv) { return fract(sin(dot(uv,vec2(12.4124,48.4124)))*48512.41241); }
const vec2 O = vec2(0.,1.);
float noise (in vec2 uv) {
    vec2 b = floor(uv);
    return mix(mix(rand(b),rand(b+O.yx),.5),mix(rand(b+O),rand(b+O.yy),.5),.5);
}

#define DIR_RIGHT -1.
#define DIR_LEFT 1.
#define DIRECTION DIR_LEFT

#define LAYERS 8
#define SPEED 40.
#define SIZE 5.

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    
    float stars = 0.;
    float fl, s;

    for (int layer = 0; layer < LAYERS; layer++) {
        fl = float(layer);
        s = (400.-fl*20.);
        stars += step(.1,pow(noise(mod(vec2(uv.x*s + iTime*SPEED*DIRECTION - fl*100.,uv.y*s),iResolution.x)),18.)) * (fl/float(LAYERS));
    }

    fragColor = vec4( vec3(stars), 1.0 );
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Star Nest
type: fragment
author: Ebanflo
---

precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform vec2 mouse;

#define iTime time
#define iResolution resolution
#define iMouse mouse

// Star Nest by Pablo RomÃ¡n Andrioli

// This content is under the MIT License.

#define iterations 12
#define formuparam 0.57

#define volsteps 10
#define stepsize 0.2

#define zoom   1.200
#define tile   1.0
#define speed  0.010 

#define brightness 0.0015
#define darkmatter 1.00
#define distfading 0.730
#define saturation 1.0

#define mo (2.0 * iMouse.xy - iResolution.xy) / iResolution.y
#define blackholeCenter vec3(time*2.,time,-2.)
#define blackholeRadius 1.2
#define blackholeIntensity 1.0

float iSphere(vec3 ray, vec3 dir, vec3 center, float radius)
{
    vec3 rc = ray-center;
    float c = dot(rc, rc) - (radius*radius);
    float b = dot(dir, rc);
    float d = b*b - c;
    float t = -b - sqrt(abs(d));
    float st = step(0.0, min(t,d));
    return mix(-1.0, t, st);
}

vec3 iPlane(vec3 ro, vec3 rd, vec3 po, vec3 pd){
    float d = dot(po - ro, pd) / dot(rd, pd);
    return d * rd + ro;
}

vec3 r(vec3 v, vec2 r)//incomplete but ultrafast rotation fcn thnx to rodolphito
{
    vec4 t = sin(vec4(r, r + 1.5707963268));
    float g = dot(v.yz, t.yw);
    return vec3(v.x * t.z - g * t.x,
                v.y * t.w - v.z * t.y,
                v.x * t.x + g * t.z);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    //get coords and direction
    vec2 uv=fragCoord.xy/iResolution.xy-.5;
    uv.y*=iResolution.y/iResolution.x;
    vec3 dir=vec3(uv*zoom,1.);
    float time=iTime*speed+.25;

    //mouse rotation
    vec3 from=vec3(0.0, 0.0, -15.0);
    from = r(from, mo / 10.0);
    dir = r(dir, mo / 10.0);
    from+=blackholeCenter;
    
    vec3 nml = normalize(blackholeCenter - from);
    vec3 pos = iPlane(from, dir, blackholeCenter, nml);
    pos = blackholeCenter - pos;
    float intensity = dot(pos, pos);
    if(intensity > blackholeRadius * blackholeRadius){
        intensity = 1.0 / intensity;
        dir = mix(dir, pos * sqrt(intensity), blackholeIntensity * intensity);
        
        //volumetric rendering
        float s=0.1,fade=1.;
        vec3 v=vec3(0.);
        for (int r=0; r<volsteps; r++) {
            vec3 p=from+s*dir*.5;
            p = abs(vec3(tile)-mod(p,vec3(tile*2.))); // tiling fold
            float pa,a=pa=0.;
            for (int i=0; i<iterations; i++) { 
                p=abs(p)/dot(p,p)-formuparam; // the magic formula
                a+=abs(length(p)-pa); // absolute sum of average change
                pa=length(p);
            }
            float dm=max(0.,darkmatter-a*a*.001); //dark matter
            a*=a*a; // add contrast
            if (r>6) fade*=1.-dm; // dark matter, don't render near
            //v+=vec3(dm,dm*.5,0.);
            v+=fade;
            v+=vec3(s,s*s,s*s*s*s)*a*brightness*fade; // coloring based on distance
            fade*=distfading; // distance fading
            s+=stepsize;
        }
        v=mix(vec3(length(v)),v,saturation); //color adjust
        fragColor = vec4(v*.01,1.); 
    }
    else fragColor = vec4(0.0);
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Star Tunnel
type: fragment
---

precision highp float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

// Star Tunnel - @P_Malin
// https://www.shadertoy.com/view/MdlXWr
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
//
// Single pass starfield inspired by old school tunnel effects.
// Each angular segment of space around the viewer selects a random star position radius and depth repeat rate.

// Increase pass count for a denser effect
#define PASS_COUNT 1

float fBrightness = 2.5;

// Number of angular segments
float fSteps = 121.0;

float fParticleSize = 0.015;
float fParticleLength = 0.5 / 60.0;

// Min and Max star position radius. Min must be present to prevent stars too near camera
float fMinDist = 0.8;
float fMaxDist = 5.0;

float fRepeatMin = 1.0;
float fRepeatMax = 2.0;

// fog density
float fDepthFade = 0.8;

float Random(float x)
{
    return fract(sin(x * 123.456) * 23.4567 + sin(x * 345.678) * 45.6789 + sin(x * 456.789) * 56.789);
}

vec3 GetParticleColour( const in vec3 vParticlePos, const in float fParticleSize, const in vec3 vRayDir )
{       
    vec2 vNormDir = normalize(vRayDir.xy);
    float d1 = dot(vParticlePos.xy, vNormDir.xy) / length(vRayDir.xy);
    vec3 vClosest2d = vRayDir * d1;
    
    vec3 vClampedPos = vParticlePos;
    
    vClampedPos.z = clamp(vClosest2d.z, vParticlePos.z - fParticleLength, vParticlePos.z + fParticleLength);
    
    float d = dot(vClampedPos, vRayDir);
    
    vec3 vClosestPos = vRayDir * d;
    
    vec3 vDeltaPos = vClampedPos - vClosestPos; 
        
    float fClosestDist = length(vDeltaPos) / fParticleSize;
    
    float fShade =  clamp(1.0 - fClosestDist, 0.0, 1.0);
        
    fShade = fShade * exp2(-d * fDepthFade) * fBrightness;
    
    return vec3(fShade);
}

vec3 GetParticlePos( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{
    float fAngle = atan(vRayDir.x, vRayDir.y);
    float fAngleFraction = fract(fAngle / (3.14 * 2.0));
    
    float fSegment = floor(fAngleFraction * fSteps + fSeed) + 0.5 - fSeed;
    float fParticleAngle = fSegment / fSteps * (3.14 * 2.0);

    float fSegmentPos = fSegment / fSteps;
    float fRadius = fMinDist + Random(fSegmentPos + fSeed) * (fMaxDist - fMinDist);
    
    float tunnelZ = vRayDir.z / length(vRayDir.xy / fRadius);
    
    tunnelZ += fZPos;
    
    float fRepeat = fRepeatMin + Random(fSegmentPos + 0.1 + fSeed) * (fRepeatMax - fRepeatMin);
    
    float fParticleZ = (ceil(tunnelZ / fRepeat) - 0.5) * fRepeat - fZPos;
    
    return vec3( sin(fParticleAngle) * fRadius, cos(fParticleAngle) * fRadius, fParticleZ );
}

vec3 Starfield( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{   
    vec3 vParticlePos = GetParticlePos(vRayDir, fZPos, fSeed);
    
    return GetParticleColour(vParticlePos, fParticleSize, vRayDir); 
}

vec3 RotateX( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( vPos.x, c * vPos.y + s * vPos.z, -s * vPos.y + c * vPos.z);
    
    return vResult;
}

vec3 RotateY( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( c * vPos.x + s * vPos.z, vPos.y, -s * vPos.x + c * vPos.z);
    
    return vResult;
}

vec3 RotateZ( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle);
    float c = cos(fAngle);
    
    vec3 vResult = vec3( c * vPos.x + s * vPos.y, -s * vPos.x + c * vPos.y, vPos.z);
    
    return vResult;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 vScreenUV = fragCoord.xy / iResolution.xy;
    
    vec2 vScreenPos = vScreenUV * 2.0 - 1.0;
    vScreenPos.x *= iResolution.x / iResolution.y;

    vec3 vRayDir = normalize(vec3(vScreenPos, 1.0));

    vec3 vEuler = vec3(0.5 + sin(iTime * 0.2) * 0.125, 0.5 + sin(iTime * 0.1) * 0.125, iTime * 0.1 + sin(iTime * 0.3) * 0.5);
            
    // if(iMouse.z > 0.0)
    // {
    //     vEuler.x = -((iMouse.y / iResolution.y) * 2.0 - 1.0);
    //     vEuler.y = -((iMouse.x / iResolution.x) * 2.0 - 1.0);
    //     vEuler.z = 0.0;
    // }
        
    vRayDir = RotateX(vRayDir, vEuler.x);
    vRayDir = RotateY(vRayDir, vEuler.y);
    vRayDir = RotateZ(vRayDir, vEuler.z);
    
    float fShade = 0.0;
        
    float a = 0.2;
    float b = 10.0;
    float c = 1.0;
    float fZPos = 5.0 + iTime * c + sin(iTime * a) * b;
    float fSpeed = c + a * b * cos(a * iTime);
    
    fParticleLength = 0.25 * fSpeed / 60.0;
    
    float fSeed = 0.0;
    
    vec3 vResult = mix(vec3(0.005, 0.0, 0.01), vec3(0.01, 0.005, 0.0), vRayDir.y * 0.5 + 0.5);
    
    for(int i=0; i<PASS_COUNT; i++)
    {
        vResult += Starfield(vRayDir, fZPos, fSeed);
        fSeed += 1.234;
    }
    
    fragColor = vec4(sqrt(vResult),1.0);
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Warp Speed
type: fragment
author: Dave Hoskins
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

// 'Warp Speed 2'
// David Hoskins 2015.
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// Fork of:-   https://www.shadertoy.com/view/Msl3WH
//----------------------------------------------------------------------------------------

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float s = 0.0, v = 0.0;
    vec2 uv = (fragCoord / iResolution.xy) * 2.0 - 1.;
    float time = (iTime-2.0)*58.0;
    vec3 col = vec3(0);
    vec3 init = vec3(sin(time * .0032)*.3, .35 - cos(time * .005)*.3, time * 0.002);
    for (int r = 0; r < 50; r++) 
    {
        vec3 p = init + s * vec3(uv, 0.05);
        p.z = fract(p.z);
        // Thanks to Kali's little chaotic loop...
        for (int i=0; i < 10; i++)  p = abs(p * 2.04) / dot(p, p) - .9;
        v += pow(dot(p, p), .7) * .06;
        col +=  vec3(v * 0.2+.4, 12.-s*2., .1 + v * 1.) * v * 0.00003;
        s += .025;
    }
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}

---
name: Galaxy Trip
type: fragment
---

precision highp float;

uniform float time;
uniform vec2 resolution;

#define iTime time
#define iResolution resolution

//  Needs a vec3 mouse for some reason
vec3 iMouse = vec3(.0, .0, .0);

//////////////////////////////////////////////////
// Xavier Benech
// Galaxy Trip
// Inspired by "Star Tunnel" shader from P_Malin
// https://www.shadertoy.com/view/MdlXWr
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// 

// Increase pass count for a denser effect
#define PASS_COUNT 4

float fBrightness = 2.5;

// Number of angular segments
float fSteps = 121.0;

float fParticleSize = 0.015;
float fParticleLength = 0.5 / 60.0;

// Min and Max star position radius. Min must be present to prevent stars too near camera
float fMinDist = 0.8;
float fMaxDist = 5.0;

float fRepeatMin = 1.0;
float fRepeatMax = 2.0;

// fog density
float fDepthFade = 0.8;

float Random(float x)
{
    return fract(sin(x * 123.456) * 23.4567 + sin(x * 345.678) * 45.6789 + sin(x * 456.789) * 56.789);
}

vec3 GetParticleColour( const in vec3 vParticlePos, const in float fParticleSize, const in vec3 vRayDir )
{       
    vec2 vNormDir = normalize(vRayDir.xy);
    float d1 = dot(vParticlePos.xy, vNormDir.xy) / length(vRayDir.xy);
    vec3 vClosest2d = vRayDir * d1;
    
    vec3 vClampedPos = vParticlePos;
    
    vClampedPos.z = clamp(vClosest2d.z, vParticlePos.z - fParticleLength, vParticlePos.z + fParticleLength);
    
    float d = dot(vClampedPos, vRayDir);
    
    vec3 vClosestPos = vRayDir * d;
    
    vec3 vDeltaPos = vClampedPos - vClosestPos; 
        
    float fClosestDist = length(vDeltaPos) / fParticleSize;
    float fShade = clamp(1.0 - fClosestDist, 0.0, 1.0);
    
    if (d<3.0)
    {
        fClosestDist = max(abs(vDeltaPos.x),abs(vDeltaPos.y)) / fParticleSize;
        float f = clamp(1.0 - 0.8*fClosestDist, 0.0, 1.0);
        fShade += f*f*f*f;
        fShade *= fShade;
    }
    
    fShade = fShade * exp2(-d * fDepthFade) * fBrightness;
    return vec3(fShade);
}

vec3 GetParticlePos( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{
    float fAngle = atan(vRayDir.x, vRayDir.y);
    float fAngleFraction = fract(fAngle / (3.14 * 2.0));
    
    float fSegment = floor(fAngleFraction * fSteps + fSeed) + 0.5 - fSeed;
    float fParticleAngle = fSegment / fSteps * (3.14 * 2.0);

    float fSegmentPos = fSegment / fSteps;
    float fRadius = fMinDist + Random(fSegmentPos + fSeed) * (fMaxDist - fMinDist);
    
    float tunnelZ = vRayDir.z / length(vRayDir.xy / fRadius);
    
    tunnelZ += fZPos;
    
    float fRepeat = fRepeatMin + Random(fSegmentPos + 0.1 + fSeed) * (fRepeatMax - fRepeatMin);
    
    float fParticleZ = (ceil(tunnelZ / fRepeat) - 0.5) * fRepeat - fZPos;
    
    return vec3( sin(fParticleAngle) * fRadius, cos(fParticleAngle) * fRadius, fParticleZ );
}

vec3 Starfield( const in vec3 vRayDir, const in float fZPos, const in float fSeed )
{   
    vec3 vParticlePos = GetParticlePos(vRayDir, fZPos, fSeed);
    
    return GetParticleColour(vParticlePos, fParticleSize, vRayDir); 
}

vec3 RotateX( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle); float c = cos(fAngle);
    return vec3( vPos.x, c * vPos.y + s * vPos.z, -s * vPos.y + c * vPos.z);
}

vec3 RotateY( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle); float c = cos(fAngle);
    return vec3( c * vPos.x + s * vPos.z, vPos.y, -s * vPos.x + c * vPos.z);
}

vec3 RotateZ( const in vec3 vPos, const in float fAngle )
{
    float s = sin(fAngle); float c = cos(fAngle);
    return vec3( c * vPos.x + s * vPos.y, -s * vPos.x + c * vPos.y, vPos.z);
}

// Simplex Noise by IQ
vec2 hash( vec2 p )
{
    p = vec2( dot(p,vec2(127.1,311.7)),
              dot(p,vec2(269.5,183.3)) );

    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec2 p )
{
    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
    const float K2 = 0.211324865; // (3-sqrt(3))/6;

    vec2 i = floor( p + (p.x+p.y)*K1 );
    
    vec2 a = p - i + (i.x+i.y)*K2;
    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0); //vec2 of = 0.5 + 0.5*vec2(sign(a.x-a.y), sign(a.y-a.x));
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0*K2;

    vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );

    vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));

    return dot( n, vec3(70.0) );
    
}

const mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );

float fbm4( in vec2 p )
{
    float f = 0.0;
    f += 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.1250*noise( p ); p = m*p*2.01;
    f += 0.0625*noise( p );
    return f;
}

float marble(in vec2 p)
{
    return cos(p.x+fbm4(p));
}

float dowarp ( in vec2 q, out vec2 a, out vec2 b )
{
    float ang=0.;
    ang = 1.2345 * sin (33.33); //0.015*iTime);
    mat2 m1 = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    ang = 0.2345 * sin (66.66); //0.021*iTime);
    mat2 m2 = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));

    a = vec2( marble(m1*q), marble(m2*q+vec2(1.12,0.654)) );

    ang = 0.543 * cos (13.33); //0.011*iTime);
    m1 = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    ang = 1.128 * cos (53.33); //0.018*iTime);
    m2 = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));

    b = vec2( marble( m2*(q + a)), marble( m1*(q + a) ) );
    
    return marble( q + b +vec2(0.32,1.654));
}

// -----------------------------------------------

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 q = 2.*uv-1.;
    q.y *= iResolution.y/iResolution.x;
    
    // camera   
    vec3 rd = normalize(vec3( q.x, q.y, 1. ));
    vec3 euler = vec3(
        sin(iTime * 0.2) * 0.625,
        cos(iTime * 0.1) * 0.625,
        iTime * 0.1 + sin(iTime * 0.3) * 0.5);

    if(iMouse.z > 0.0)
    {
        euler.x = -((iMouse.y / iResolution.y) * 2.0 - 1.0);
        euler.y = -((iMouse.x / iResolution.x) * 2.0 - 1.0);
        euler.z = 0.0;
    }
    rd = RotateX(rd, euler.x);
    rd = RotateY(rd, euler.y);
    rd = RotateZ(rd, euler.z);
    
    // Nebulae Background
    float pi = 3.141592654;
    q.x = 0.5 + atan(rd.z, rd.x)/(2.*pi);
    q.y = 0.5 - asin(rd.y)/pi + 0.512 + 0.001*iTime;
    q *= 2.34;
    
    vec2 wa = vec2(0.);
    vec2 wb = vec2(0.);
    float f = dowarp(q, wa, wb);
    f = 0.5+0.5*f;
    
    vec3 col = vec3(f);
    float wc = 0.;
    wc = f;
    col = vec3(wc, wc*wc, wc*wc*wc);
    wc = abs(wa.x);
    col -= vec3(wc*wc, wc, wc*wc*wc);
    wc = abs(wb.x);
    col += vec3(wc*wc*wc, wc*wc, wc);
    col *= 0.7;
    col.x = pow(col.x, 2.18);
    col.z = pow(col.z, 1.88);
    col = smoothstep(0., 1., col);
    col = 0.5 - (1.4*col-0.7)*(1.4*col-0.7);
    col = 0.75*sqrt(col);
    col *= 1. - 0.5*fbm4(8.*q);
    col = clamp(col, 0., 1.);
    
    // StarField
    float fShade = 0.0;
    float a = 0.2;
    float b = 10.0;
    float c = 1.0;
    float fZPos = 5.0;// + iTime * c + sin(iTime * a) * b;
    float fSpeed = 0.; //c + a * b * cos(a * iTime);
    
    fParticleLength = 0.25 * fSpeed / 60.0;
    
    float fSeed = 0.0;
    
    vec3 vResult = vec3(0.);
    
    vec3 red = vec3(0.7,0.4,0.3);
    vec3 blue = vec3(0.3,0.4,0.7);
    vec3 tint = vec3(0.);
    float ti = 1./float(PASS_COUNT-1);
    float t = 0.;
    for(int i=0; i<PASS_COUNT; i++)
    {
        tint = mix(red,blue,t);
        vResult += 1.1*tint*Starfield(rd, fZPos, fSeed);
        t += ti;
        fSeed += 1.234;
        rd = RotateX(rd, 0.25*euler.x);
    }
    
    col += sqrt(vResult);
    
    // Vignetting
    // vec2 r = -1.0 + 2.0*(uv);
    // float vb = max(abs(r.x), abs(r.y));
    // col *= (0.15 + 0.85*(1.0-exp(-(1.0-vb)*30.0)));
    fragColor = vec4( col, 1.0 );
}

void main(void)
{
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
