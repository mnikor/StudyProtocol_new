/**
 * Helper function for making API requests
 * Similar to fetch but with default options and error handling
 * 
 * @param url The URL to request
 * @param method Optional HTTP method (GET, POST, PUT, DELETE)
 * @param data Optional data to send with the request
 * @param customOptions Optional additional fetch options
 * @returns Parsed JSON response
 */
import { summarizeForConsole } from "./protocol-sanitize";

export async function apiRequest(
  url: string, 
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any,
  customOptions?: RequestInit
) {
  console.log(`API Request: ${method} ${url}`, data ? summarizeForConsole(data) : '[no body]');
  // Set default headers
  const headers = customOptions?.headers || {
    'Content-Type': 'application/json'
  };
  
  // Prepare the request options
  const requestOptions: RequestInit = {
    method,
    ...customOptions,
    headers
  };
  
  // Add body for POST/PUT requests if data is provided
  if (data && (method === 'POST' || method === 'PUT')) {
    requestOptions.body = JSON.stringify(data);
  }
  
  try {
    // Make the request
    const response = await fetch(url, requestOptions);
    
    // If response is not ok, throw an error
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }
    
    // For DELETE requests that return 204 No Content, return an empty object
    if (method === 'DELETE' && response.status === 204) {
      return {};
    }
    
    // For other successful responses, parse and return the JSON response
    const responseText = await response.text();
    console.log("API response received:", { url, status: response.status, characters: responseText.length });
    
    try {
      const jsonResponse = JSON.parse(responseText);
      console.log("Parsed API response:", summarizeForConsole(jsonResponse));
      return jsonResponse;
    } catch (error) {
      console.error("Failed to parse JSON response:", error);
      console.log("Using raw text as response");
      return { response: responseText };
    }
  } catch (error: any) {
    // Log and re-throw the error with improved context
    console.error(`API Request Error (${url}):`, error);
    
    // If it's already an Error with a message, re-throw it
    if (error instanceof Error) {
      throw error;
    }
    
    // Otherwise, create a new error
    throw new Error(`API Request Failed: ${error}`);
  }
}
