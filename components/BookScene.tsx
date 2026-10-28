'use client';
import {useEffect,useRef,useState} from 'react';
import {Minus,Plus,X} from 'lucide-react';
import type {Recipe} from '@/lib/recipe';
import type {createBookScene} from './book-model';
export default function BookScene({onRead,recipes,onRecipe}:{onRead:()=>void;recipes:Recipe[];onRecipe:(recipe:Recipe)=>void}){
 const recipeRef=useRef(recipes);recipeRef.current=recipes;
 const host=useRef<HTMLDivElement>(null),controls=useRef<ReturnType<typeof createBookScene>|null>(null);
 const [pageIndex,setPageIndex]=useState(0),[ready,setReady]=useState(false),[open,setOpen]=useState(false),[failed,setFailed]=useState(false),[zoomed,setZoomed]=useState(false),[animating,setAnimating]=useState(false);
 useEffect(()=>{let disposed=false;
  import('./book-model').then(({createBookScene})=>{if(disposed||!host.current)return;try{controls.current=createBookScene(host.current,()=>recipeRef.current,setPageIndex,setAnimating);setReady(true)}catch{setFailed(true)}}).catch(()=>{if(!disposed)setFailed(true)});
  return()=>{disposed=true;controls.current?.dispose();controls.current=null};
 },[]);
 return <div className={'book-stage book-v2 '+(zoomed?'book-zoomed':'')}>
  <div ref={host} className="book-canvas" aria-hidden="true"/>
  {!ready&&!failed&&<span className="book-loading">L’atelier prend lumière…</span>}
  {failed?<div className="book-fallback"><img src="./book-fallback-v2.webp" alt="Le livre Nacre en toile ivoire, inscriptions noires et reliure cousue"/><button className="book-control" onClick={onRead}>Découvrir le grand livre <span>↗</span></button></div>:<>
   {ready&&<div className="book-view-tools"><button className="book-view-control" title={zoomed?'Reculer le livre':'Rapprocher le livre'} aria-label={zoomed?'Reculer le livre':'Rapprocher le livre'} aria-pressed={zoomed} onClick={()=>{controls.current?.zoom(!zoomed);setZoomed(!zoomed)}}>{zoomed?<Minus size={15}/>:<Plus size={15}/>}</button>{open&&<button className="book-view-control" disabled={animating} title="Fermer le livre" aria-label="Fermer le livre" onClick={()=>{controls.current?.close();setOpen(false)}}><X size={15}/></button>}</div>}
   <div className="book-actions"><button className="book-control" disabled={!ready||animating} onClick={()=>{controls.current?.flip();setOpen(true)}}>{animating?'Un instant…':open?'Tourner une page':'Ouvrir le livre'} <span>↗</span></button>{open&&<button className="book-control" onClick={()=>recipes[pageIndex]?onRecipe(recipes[pageIndex]):onRead()}>Lire cette recette →</button>}</div>
  </>}
 </div>
}
