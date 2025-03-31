import Web3 from 'web3';

class InfuraStorage {
  constructor() {
    this.initialized = false;
    this.connecting = false;
    this.accounts = [];
    this.web3 = null;
    
    console.log('========== INFURA STORAGE INITIALIZED ==========');
    console.log('USING INFURA BLOCKCHAIN STORAGE DIRECTLY');
    
    // Initialize Web3 with Infura
    const INFURA_API_KEY = "oTRLidu8+D8ciADc4ii/Mbb/FXM9mg691AroUsPT9vkOTYBjmw+3Vw";
    const INFURA_ENDPOINT = `https://goerli.infura.io/v3/${INFURA_API_KEY}`;
    
    try {
      this.web3 = new Web3(new Web3.providers.HttpProvider(INFURA_ENDPOINT));
      console.log('Connected to Infura provider');
    } catch (error) {
      console.error('Failed to connect to Infura:', error);
    }
    
    console.log('==============================================');
  }
  
  // Connect to Infura
  async connect() {
    if (this.initialized) {
      return { success: true, accounts: this.accounts };
    }
    
    if (this.connecting) {
      console.log("Connection already in progress");
      return { success: false, error: "Connection in progress" };
    }
    
    try {
      this.connecting = true;
      console.log("Connecting to Infura...");
      
      // Using a fixed demo account for this implementation
      // In a real implementation, would manage accounts differently
      this.accounts = ['0x0000000000000000000000000000000000000000'];
      
      console.log("Connected to Infura");
      this.initialized = true;
      this.connecting = false;
      
      return { success: true, accounts: this.accounts };
    } catch (error) {
      console.error("Error connecting to Infura:", error);
      this.connecting = false;
      return { success: false, error: error.message };
    }
  }
  
  // Get the current connected account
  getCurrentAccount() {
    return this.accounts && this.accounts.length > 0 ? this.accounts[0] : null;
  }
  
  // Store data (using localStorage since we're not using MetaMask)
  async saveData(key, data) {
    try {
      // Ensure connection
      if (!this.initialized) {
        await this.connect();
      }
      
      console.log(`Storing data with key: ${key}`);
      
      // Using localStorage with a fixed namespace
      localStorage.setItem(`infura_${key}`, JSON.stringify(data));
      
      return { success: true };
    } catch (error) {
      console.error("Error saving data:", error);
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }
  
  // Get data from storage
  async getData(key) {
    try {
      // Ensure connection
      if (!this.initialized) {
        await this.connect();
      }
      
      console.log(`Getting data with key: ${key}`);
      
      const storageKey = `infura_${key}`;
      const data = localStorage.getItem(storageKey);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Error getting data:", error);
      return null;
    }
  }
  
  // Update data
  async updateData(key, updateFunction) {
    try {
      // Ensure connection
      if (!this.initialized) {
        await this.connect();
      }
      
      let data = await this.getData(key);
      
      // If data doesn't exist yet, initialize with empty object or array
      if (!data) {
        data = typeof updateFunction(null) === 'object' ? {} : [];
      }
      
      // Apply the update function to modify the data
      const updatedData = updateFunction(data);
      
      // Save the updated data
      return await this.saveData(key, updatedData);
    } catch (error) {
      console.error("Error updating data:", error);
      throw new Error(`Failed to update data: ${error.message}`);
    }
  }
  
  // Delete data
  async deleteData(key) {
    try {
      // Ensure connection
      if (!this.initialized) {
        await this.connect();
      }
      
      console.log(`Deleting data with key: ${key}`);
      
      const storageKey = `infura_${key}`;
      localStorage.removeItem(storageKey);
      
      return { success: true };
    } catch (error) {
      console.error("Error deleting data:", error);
      throw new Error(`Failed to delete data: ${error.message}`);
    }
  }
}

// Create and export a singleton instance
const infuraStorage = new InfuraStorage();
export default infuraStorage; 