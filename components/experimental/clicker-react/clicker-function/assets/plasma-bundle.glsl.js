---
name: Raymarched Plasma
type: fragment
author: https://www.shadertoy.com/view/ldSfzm
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

varying vec2 fragCoord;

// Raymarched plasma
// Idea based on iq 2 tweet raymarch: https://www.shadertoy.com/view/MsfGzM

float m(vec3 p) 
{ 
    p.z+=5.*time; 

    return length(.2*sin(p.x-p.y)+cos(p/3.))-.8;
}

void mainImage(out vec4 c,vec2 u)
{
    vec3 d=.5-vec3(u,0) / resolution.x,o=d;

    for(int i=0;i<64;i++) o+=m(o)*d;

    c.xyz = abs(m(o+d)*vec3(.3,.15,.1)+m(o*.5)*vec3(.1,.05,0))*(8.-o.x/2.);
}

void main(void)
{
    mainImage(gl_FragColor, fragCoord.xy);
}

---
name: Marble
type: fragment
author: klk (https://www.shadertoy.com/view/XsVSzW)
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

varying vec2 fragCoord;

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord.xy / resolution.xx-0.5)*8.0;
    vec2 uv0=uv;
    float i0=1.0;
    float i1=1.0;
    float i2=1.0;
    float i4=0.0;
    for(int s=0;s<7;s++)
    {
        vec2 r;
        r=vec2(cos(uv.y*i0-i4+time/i1),sin(uv.x*i0-i4+time/i1))/i2;
        r+=vec2(-r.y,r.x)*0.3;
        uv.xy+=r;
        
        i0*=1.93;
        i1*=1.15;
        i2*=1.7;
        i4+=0.05+0.1*time*i1;
    }
    float r=sin(uv.x-time)*0.5+0.5;
    float b=sin(uv.y+time)*0.5+0.5;
    float g=sin((uv.x+uv.y+sin(time*0.5))*0.5)*0.5+0.5;
    fragColor = vec4(r,g,b,1.0);
}

void main(void)
{
    mainImage(gl_FragColor, fragCoord.xy);
    gl_FragColor.a = 1.0;
}

---
name: Flower Plasma
type: fragment
author: epsilum (https://www.shadertoy.com/view/Xdf3zH)
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

varying vec2 fragCoord;

float addFlower(float x, float y, float ax, float ay, float fx, float fy)
{
    float xx=(x+sin(time*fx)*ax)*8.0;
    float yy=(y+cos(time*fy)*ay)*8.0;
    float angle = atan(yy,xx);
    float zz = 1.5*(cos(18.0*angle)*0.5+0.5) / (0.7 * 3.141592) + 1.2*(sin(15.0*angle)*0.5+0.5)/ (0.7 * 3.141592);
    
    return zz;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 xy=(fragCoord.xy/resolution.x)*2.0-vec2(1.0,resolution.y/resolution.x);
   
    float x=xy.x;
    float y=xy.y;
    
    float p1 = addFlower(x, y, 0.8, 0.9, 0.95, 0.85);
    float p2 = addFlower(x, y, 0.7, 0.9, 0.42, 0.71);
    float p3 = addFlower(x, y, 0.5, 1.0, 0.23, 0.97);
    float p4 = addFlower(x, y, 0.8, 0.5, 0.81, 1.91);

    float p=clamp((p1+p2+p3+p4)*0.25, 0.0, 1.0);

    vec4 col;
    if (p < 0.5)
        col=vec4(mix(0.0,1.0,p*2.0), mix(0.0,0.63,p*2.0), 0.0, 1.0);
    else if (p >= 0.5 && p <= 0.75)
        col=vec4(mix(1.0, 1.0-0.32, (p-0.5)*4.0), mix(0.63, 0.0, (p-0.5)*4.0), mix(0.0,0.24,(p-0.5)*4.0), 1.0);
    else
        col=vec4(mix(0.68, 0.0, (p-0.75)*4.0), 0.0, mix(0.24, 0.0, (p-0.75)*4.0), 1.0); 

    fragColor = col;
}

void main(void)
{
    mainImage(gl_FragColor, fragCoord.xy);
    gl_FragColor.a = 1.0;
}

---
name: Plasma
type: fragment
author: triggerHLM (https://www.shadertoy.com/view/MdXGDH)
---

precision mediump float;

uniform float time;
uniform vec2 resolution;

varying vec2 fragCoord;

const float PI = 3.14159265;

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {

    float time = time * 0.2;

    float color1, color2, color;
    
    color1 = (sin(dot(fragCoord.xy,vec2(sin(time*3.0),cos(time*3.0)))*0.02+time*3.0)+1.0)/2.0;
    
    vec2 center = vec2(640.0/2.0, 360.0/2.0) + vec2(640.0/2.0*sin(-time*3.0),360.0/2.0*cos(-time*3.0));
    
    color2 = (cos(length(fragCoord.xy - center)*0.03)+1.0)/2.0;
    
    color = (color1+ color2)/2.0;

    float red   = (cos(PI*color/0.5+time*3.0)+1.0)/2.0;
    float green = (sin(PI*color/0.5+time*3.0)+1.0)/2.0;
    float blue  = (sin(+time*3.0)+1.0)/2.0;
    
    fragColor = vec4(red, green, blue, 1.0);
}

void main(void)
{
    mainImage(gl_FragColor, fragCoord.xy);
    gl_FragColor.a = 1.0;
}
