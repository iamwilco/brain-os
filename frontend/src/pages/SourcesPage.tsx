import { useNavigate } from "react-router-dom"
import { CollectionList } from "@/components/sources/CollectionList"

export function SourcesPage() {
  const navigate = useNavigate()
  
  return (
    <div className="space-y-6">
      <CollectionList 
        onCollectionClick={(collection) => navigate(`/sources/${collection.id}`)}
      />
    </div>
  )
}
