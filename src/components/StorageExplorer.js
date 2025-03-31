import React, { useState, useEffect } from 'react';

const StorageExplorer = ({ initialPath = '' }) => {
  const [storageData, setStorageData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  useEffect(() => {
    loadStorageData();
    updateBreadcrumbs();
  }, [currentPath]);

  const updateBreadcrumbs = () => {
    const paths = currentPath.split('/').filter(p => p);
    const crumbs = paths.map((path, index) => ({
      name: path,
      path: '/' + paths.slice(0, index + 1).join('/')
    }));
    setBreadcrumbs([{ name: 'Root', path: '' }, ...crumbs]);
  };

  const createFolder = (folderPath) => {
    const key = `folder:${folderPath}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({
        type: 'folder',
        created: new Date().toISOString(),
        items: []
      }));
    }
  };

  const ensureFolderStructure = (teacherEmail, className = null) => {
    const teacherPath = `/teachers/${teacherEmail}`;
    createFolder(teacherPath);
    
    if (className) {
      const classPath = `${teacherPath}/${className}`;
      createFolder(classPath);
      createFolder(`${classPath}/recordings`);
      createFolder(`${classPath}/summaries`);
    }
  };

  const loadStorageData = () => {
    const data = [];
    const prefix = currentPath.startsWith('/') ? currentPath.slice(1) : currentPath;
    
    // Get all items from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      // Skip items that don't match the current path
      if (prefix && !key.startsWith(prefix)) continue;
      
      try {
        const parsedValue = JSON.parse(value);
        const isFolder = key.startsWith('folder:');
        const relativePath = key.replace('folder:', '');
        
        if (isFolder) {
          data.push({
            name: relativePath.split('/').pop() || 'Root',
            type: 'folder',
            path: relativePath,
            size: '-',
            value: parsedValue,
            lastModified: parsedValue.created,
            isFolder: true
          });
        } else {
          // Handle files
          const type = key.startsWith('recording_') ? 'audio' : 
                      typeof parsedValue === 'object' ? 'json' : 'text';
          
          data.push({
            name: key.split('/').pop(),
            type,
            path: key,
            size: new Blob([value]).size,
            value: parsedValue,
            lastModified: new Date().toISOString(),
            isFolder: false
          });
        }
      } catch (error) {
        console.error(`Error parsing item ${key}:`, error);
      }
    }

    sortData(data, sortBy, sortOrder);
    setStorageData(data);
  };

  const handleFolderClick = (folder) => {
    setCurrentPath(folder.path);
  };

  const navigateToBreadcrumb = (path) => {
    setCurrentPath(path);
  };

  const sortData = (data, by, order) => {
    return data.sort((a, b) => {
      // Folders always come first
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      let comparison = 0;
      switch (by) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          if (a.isFolder && b.isFolder) return 0;
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = new Date(a.lastModified) - new Date(b.lastModified);
          break;
        default:
          comparison = 0;
      }
      return order === 'asc' ? comparison : -comparison;
    });
  };

  const handleSort = (by) => {
    const newOrder = sortBy === by && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(by);
    setSortOrder(newOrder);
    setStorageData(prev => sortData([...prev], by, newOrder));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleItemClick = (item) => {
    setSelectedItem(selectedItem?.path === item.path ? null : item);
  };

  const downloadItem = (item) => {
    const data = localStorage.getItem(item.path);
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteItem = (item) => {
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      localStorage.removeItem(item.path);
      loadStorageData();
      if (selectedItem?.path === item.path) {
        setSelectedItem(null);
      }
    }
  };

  return (
    <div className="storage-explorer">
      <div className="storage-header">
        <h3>Storage Explorer</h3>
        <div className="storage-stats">
          <span>Total Items: {storageData.length}</span>
          <span>Current Path: {currentPath || '/'}</span>
        </div>
      </div>

      <div className="breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 && <span className="breadcrumb-separator">/</span>}
            <button 
              className="breadcrumb-button"
              onClick={() => navigateToBreadcrumb(crumb.path)}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="storage-content">
        <div className="storage-list">
          <div className="storage-list-header">
            <button onClick={() => handleSort('name')} className={sortBy === 'name' ? 'active' : ''}>
              Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button onClick={() => handleSort('type')} className={sortBy === 'type' ? 'active' : ''}>
              Type {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button onClick={() => handleSort('size')} className={sortBy === 'size' ? 'active' : ''}>
              Size {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button onClick={() => handleSort('date')} className={sortBy === 'date' ? 'active' : ''}>
              Modified {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <div className="actions-header">Actions</div>
          </div>

          <div className="storage-items">
            {storageData.map((item) => (
              <div 
                key={item.path} 
                className={`storage-item ${selectedItem?.path === item.path ? 'selected' : ''}`}
                onClick={() => item.isFolder ? handleFolderClick(item) : handleItemClick(item)}
              >
                <span className="item-name">
                  <i className={`item-icon ${item.isFolder ? 'folder' : item.type}`}></i>
                  {item.name}
                </span>
                <span className="item-type">{item.isFolder ? 'Folder' : item.type}</span>
                <span className="item-size">{item.isFolder ? '-' : formatSize(item.size)}</span>
                <span className="item-date">{formatDate(item.lastModified)}</span>
                {!item.isFolder && (
                  <div className="item-actions">
                    <button onClick={(e) => { e.stopPropagation(); downloadItem(item); }}>
                      Download
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteItem(item); }}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {selectedItem && !selectedItem.isFolder && (
          <div className="storage-preview">
            <h4>Preview: {selectedItem.name}</h4>
            <div className="preview-content">
              {selectedItem.type === 'audio' ? (
                <audio controls src={selectedItem.value} />
              ) : (
                <pre>{typeof selectedItem.value === 'object' 
                  ? JSON.stringify(selectedItem.value, null, 2) 
                  : selectedItem.value}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageExplorer; 