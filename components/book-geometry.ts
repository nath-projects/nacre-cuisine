/** Arc-length-preserving turn around the sewn fold (Y is up, Z along spine). */
export const LEAF_WIDTH=2.27;
export function leafPoint(u:number,z:number,theta:number,backside=false):[number,number,number]{
 let x=0,y=0;const segments=24,settling=Math.pow(Math.sin(theta/2),8);
 for(let j=0;j<segments;j++){
  const t=(j+.5)/segments*u;
  // Integrate unit tangents, including the gutter: bending cannot stretch paper.
  const slope=-.406*Math.exp(-14*t)-settling*2.56*Math.exp(-8*t)+.008*Math.PI*Math.cos(Math.PI*t)*Math.cos(z*1.2);
  const tangent=theta+Math.sin(theta)*(.68*(t-.45)+.075*Math.sin(z*1.6))+Math.atan(slope/LEAF_WIDTH)*Math.cos(theta);
  x+=Math.cos(tangent)*LEAF_WIDTH*u/segments;
  y+=Math.sin(tangent)*LEAF_WIDTH*u/segments;
 }
 const offset=backside?.001:0;
 return [x+Math.sin(theta)*offset,.46+y-Math.cos(theta)*offset,z+Math.sin(theta)*Math.sin(u*Math.PI)*.012*Math.sin(z)];
}
