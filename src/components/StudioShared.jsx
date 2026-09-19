import { useLocal } from '../lib/local';
import { useSession } from '../lib/session';
export function useStudio(id,fallback){const {user}=useSession();return useLocal(`astral-studio:${user?.uid||'guest'}:${id}`,fallback);}
export function Field({label,children}){return <label className="studio-field"><span>{label}</span>{children}</label>;}
export function Output({value}){return <label className="studio-field"><span>Result</span><textarea readOnly value={value} rows={10}/></label>;}
