import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Nacre — L’atelier des recettes',description:'Imaginez, cuisinez, transmettez. Votre atelier de recettes et vos carnets personnels.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="fr"><body>{children}</body></html>}
