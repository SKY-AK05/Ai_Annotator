import sys
import os

filepath = r"c:\Users\Aakash\Documents\PROJECT WEB\orchvate\AI_ANNOTATE\Ai_Annotator\src\components\EvaluationForm.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add editingInstanceId state
state_search = "  const [showNewInstanceKey, setShowNewInstanceKey] = useState(false);\n  const [isInstancesOpen, setIsInstancesOpen] = useState(true);"
state_replace = "  const [showNewInstanceKey, setShowNewInstanceKey] = useState(false);\n  const [isInstancesOpen, setIsInstancesOpen] = useState(true);\n  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);"
content = content.replace(state_search, state_replace)

# 2. Update imports
import_search = "import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle, Settings, Eye, EyeOff, DownloadCloud, Plus, Trash2 } from 'lucide-react';"
import_replace = "import { Loader2, UploadCloud, FileCog, Image as ImageIcon, CheckCircle, Settings, Eye, EyeOff, DownloadCloud, Plus, Trash2, Pencil, X } from 'lucide-react';"
content = content.replace(import_search, import_replace)

# 3. Replace handleAddInstance with handleSaveInstance and edit methods
handle_search = """  const handleAddInstance = () => {
      if (!newInstanceName.trim() || !newInstanceUrl.trim() || !newInstanceKey.trim()) {
          toast({ title: "Validation Error", description: "Name, URL, and API Key are required.", variant: "destructive" });
          return;
      }
      const newInstance: CvatInstance = {
          id: Date.now().toString(),
          name: newInstanceName.trim(),
          url: newInstanceUrl.trim(),
          apiKey: newInstanceKey.trim()
      };
      saveInstances([...savedInstances, newInstance]);
      setNewInstanceName('');
      setNewInstanceKey('');
      toast({ title: "Instance Saved", description: "CVAT Instance added successfully." });
  };"""

handle_replace = """  const handleSaveInstance = () => {
      if (!newInstanceName.trim() || !newInstanceUrl.trim() || !newInstanceKey.trim()) {
          toast({ title: "Validation Error", description: "Name, URL, and API Key are required.", variant: "destructive" });
          return;
      }
      
      if (editingInstanceId) {
          const updatedInstances = savedInstances.map(inst => 
              inst.id === editingInstanceId 
                  ? { ...inst, name: newInstanceName.trim(), url: newInstanceUrl.trim(), apiKey: newInstanceKey.trim() } 
                  : inst
          );
          saveInstances(updatedInstances);
          setEditingInstanceId(null);
          toast({ title: "Instance Updated", description: "CVAT Instance updated successfully." });
      } else {
          const newInstance: CvatInstance = {
              id: Date.now().toString(),
              name: newInstanceName.trim(),
              url: newInstanceUrl.trim(),
              apiKey: newInstanceKey.trim()
          };
          saveInstances([...savedInstances, newInstance]);
          toast({ title: "Instance Saved", description: "CVAT Instance added successfully." });
      }
      
      setNewInstanceName('');
      setNewInstanceUrl('https://opencvat-ig.orchvate.com');
      setNewInstanceKey('');
  };

  const handleEditInstance = (inst: CvatInstance) => {
      setEditingInstanceId(inst.id);
      setNewInstanceName(inst.name);
      setNewInstanceUrl(inst.url);
      setNewInstanceKey(inst.apiKey);
  };

  const cancelEdit = () => {
      setEditingInstanceId(null);
      setNewInstanceName('');
      setNewInstanceUrl('https://opencvat-ig.orchvate.com');
      setNewInstanceKey('');
  };"""
content = content.replace(handle_search, handle_replace)

# 4. Update JSX for saved instances list
list_search = """                                  <div className="flex flex-col">
                                      <span className="text-sm font-bold">{inst.name}</span>
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-xs">{inst.url}</span>
                                  </div>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteInstance(inst.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100">
                                      <Trash2 className="h-4 w-4" />
                                  </Button>"""

list_replace = """                                  <div className="flex flex-col">
                                      <span className="text-sm font-bold">{inst.name}</span>
                                      <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-xs">{inst.url}</span>
                                  </div>
                                  <div className="flex gap-2">
                                      <Button type="button" variant="ghost" size="sm" onClick={() => handleEditInstance(inst)} className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100">
                                          <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteInstance(inst.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100">
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>"""
content = content.replace(list_search, list_replace)

# 5. Update Add Instance Header
header_search = """                  <div className="p-3 border-2 border-foreground rounded-sm border-dashed bg-muted/20 space-y-3">
                      <Label className="text-xs font-bold flex items-center gap-1"><Plus className="h-3 w-3"/> Add New Instance</Label>"""
header_replace = """                  <div className="p-3 border-2 border-foreground rounded-sm border-dashed bg-muted/20 space-y-3">
                      <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold flex items-center gap-1">
                              {editingInstanceId ? <Pencil className="h-3 w-3"/> : <Plus className="h-3 w-3"/>} 
                              {editingInstanceId ? "Edit Instance" : "Add New Instance"}
                          </Label>
                          {editingInstanceId && (
                              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} className="h-5 px-1 text-[10px] text-muted-foreground hover:text-foreground">
                                  <X className="h-3 w-3 mr-1" /> Cancel Edit
                              </Button>
                          )}
                      </div>"""
content = content.replace(header_search, header_replace)

# 6. Update Add Instance Button
btn_search = """                      <Button type="button" onClick={handleAddInstance} variant="secondary" size="sm" className="w-full text-xs font-bold border-2 shadow-hard">
                          Add Instance
                      </Button>"""
btn_replace = """                      <Button type="button" onClick={handleSaveInstance} variant="secondary" size="sm" className="w-full text-xs font-bold border-2 shadow-hard">
                          {editingInstanceId ? "Save Changes" : "Add Instance"}
                      </Button>"""
content = content.replace(btn_search, btn_replace)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
