import React, { useState, useEffect } from 'react';
import wasabiStorage from '../services/WasabiStorage';

const StorageExplorer = ({ initialPath = '' }) => {
  const [storageData, setStorageData] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [error, setError] = useState('');

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

  const loadStorageData = async () => {
    try {
      setError('');
      const data = [];
      const prefix = currentPath.startsWith('/') ? currentPath.slice(1) : currentPath;
      
      // List objects in current path
      const objects = await wasabiStorage.listObjects(prefix);
      
      for (const obj of objects) {
        const key = obj.Key;
        const name = key.split('/').pop();
        
        // Skip if not in current directory
        if (prefix && !key.startsWith(prefix)) continue;
        
        // Determine if it's a folder
        const isFolder = key.endsWith('/');
        
        if (isFolder) {
          data.push({
            name: name || 'Root',
            type: 'folder',
            path: key,
            size: '-',
            lastModified: obj.LastModified,
            isFolder: true
          });
        } else if (key.endsWith('.json')) {
          // For JSON files, fetch and parse the content
          const content = await wasabiStorage.getData(key);
          data.push({
            name,
            type: 'json',
            path: key,
            size: new Blob([JSON.stringify(content)]).size,
            value: content,
            lastModified: obj.LastModified,
            isFolder: false
          });
        } else {
          // For other files
          data.push({
            name,
            type: 'file',
            path: key,
            size: obj.Size,
            lastModified: obj.LastModified,
            isFolder: false
          });
        }
      }

      sortData(data, sortBy, sortOrder);
      setStorageData(data);
    } catch (error) {
      console.error('Error loading storage data:', error);
      setError('Failed to load storage data');
    }
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

  const downloadItem = async (item) => {
    try {
      const data = await wasabiStorage.getBinaryData(item.path);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      setError('Failed to download file');
    }
  };

  const deleteItem = async (item) => {
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      try {
        await wasabiStorage.deleteData(item.path);
        loadStorageData();
        if (selectedItem?.path === item.path) {
          setSelectedItem(null);
        }
      } catch (error) {
        console.error('Error deleting item:', error);
        setError('Failed to delete item');
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

      {error && <div className="error-message">{error}</div>}

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
              {selectedItem.type === 'json' ? (
                <pre>{JSON.stringify(selectedItem.value, null, 2)}</pre>
              ) : (
                <div>Binary file - Download to view</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorageExplorer; 